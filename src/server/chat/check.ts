/**
 * Layered chat checker. Decides, before delivery, whether a message is trying
 * to move contact or payment off Saait. Layers run cheapest first:
 *   1. normalise (src/server/text/normalise.ts)
 *   2. rules over the normalised body
 *   3. the same rules over the last five messages joined with the body
 *   4. an intent classifier behind an interface, no-op by default
 * Pure; no I/O. Rules are deliberately narrow: a run of digits is only a
 * phone when it has a Nepal phone shape, so dates and amounts pass.
 */

import { normalise } from "../text/normalise";

export type CheckLayer = 1 | 2 | 3 | 4;
export type ReasonKind = "phone" | "payment" | "link" | "intent";

export type CheckResult =
  | { ok: true }
  | { ok: false; layer: CheckLayer; reason: string; match?: string };

export interface IntentClassifier {
  /** 0 to 1; how likely the message is trying to take the deal off Saait. */
  score(text: string, context: string[]): Promise<number>;
}

export const noIntentClassifier: IntentClassifier = { score: async () => 0 };

/** Plain sentences shown to the sender next to "Not sent". */
export const REASONS: Record<ReasonKind, string> = {
  phone: "Phone numbers can't be shared on Saait. Your deposit is protected only when you pay here.",
  payment: "Phone numbers and payment details can't be shared on Saait. Your deposit is protected only when you pay here.",
  link: "Links, usernames and other messaging apps can't be shared on Saait. Keep the conversation here so your deposit stays protected.",
  intent: "This message looks like it is arranging contact or payment outside Saait. Your deposit is protected only when you pay here.",
};

const DIGIT_RUN = /\d+/g;
// An amount: the run sits right after rs, npr or रु.
const AMOUNT_PREFIX = /(?:\brs\.?|\bnpr|रु\.?)\s*$/;
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const SHORTENER = /\b(?:bit\.ly|tiny\.cc|cutt\.ly|rb\.gy|is\.gd|short\.io|t\.co|wa\.me)\b/;
const URL = new RegExp(
  `\\bhttps?:\\/\\/\\S+|\\bwww\\.\\S+|${SHORTENER.source}|\\b[\\w-]+\\.(?:com|np|me|ly|io|link)\\b`,
);
const HANDLE = /(?<![\w.])@\w{3,}/;
// "ig" is only a handle cue when a handle-like token follows it.
const IG_HANDLE = /\big[:\s]+[a-z0-9][a-z0-9_.]{2,}/;
const APP_WORD = /\b(?:whatsapp?|viber|telegram|instagram|insta|facebook|fb|messenger|tiktok|snapchat|dm me)\b/;
// "signal" and "imo" are ordinary words too, so they only count next to a contact cue.
const CONTEXT_APP_WORD =
  /\b(?:on|via|through|in)\s+(?:signal|imo)\b|\b(?:signal|imo)\s+(?:app|ma|call|me|id|number)\b|\b(?:message|msg|text|call|dm|ping)\b[^.?!]{0,24}?\b(?:signal|imo)\b/;
const EMAIL_WORD = /\b(?:gmail|yahoo|hotmail|outlook|mail id|email id|email address)\b|\bat\s+\S+\s+dot\s+(?:com|np|net|org)\b/;
const PAYMENT_WORD =
  /\b(?:esewa|khalti|fonepay|ime ?pay|connectips|bank account|account (?:number|no\.?)|acc|acct|a\/c(?: no\.?)?)\b/;
// A number is being dictated: digit groups in the message may add up to one.
const PHONE_INTENT = /\b(?:number|numbr|num|call|phone|mobile|whatsapp|viber|contact)\b|\bno\.|नम्बर|फोन/;
const COUNTRY_CODE = /\+977/;

// Folds the normaliser leaves alone but the rules need: a single number word
// glued to digits ("98four1") and app names split by a space or apostrophe.
const GLUED_NUMBER_WORD =
  /(?<=\d)(?:zero|one|two|three|four|five|six|seven|eight|nine)|(?:zero|one|two|three|four|five|six|seven|eight|nine)(?=\d)/g;
const GLUED_DIGIT: Record<string, string> = {
  zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9",
};
const SPLIT_APP: [RegExp, string][] = [
  [/\bwhat'?s'?\s*app/g, "whatsapp"],
  [/\binsta\s+gram\b/g, "instagram"],
  [/\bface\s+book\b/g, "facebook"],
  [/\btele\s+gram\b/g, "telegram"],
  [/\btik\s+tok\b/g, "tiktok"],
];

type Match = { kind: ReasonKind; match: string };

/** normalise() plus the checker's own folds. */
function prepare(text: string): string {
  let s = normalise(text).replace(GLUED_NUMBER_WORD, (w) => GLUED_DIGIT[w]);
  for (const [pattern, joined] of SPLIT_APP) s = s.replace(pattern, joined);
  return s;
}

/** True for an 8-digit run that reads as yyyymmdd or ddmmyyyy, AD 2020–2099 or BS 2070–2099. */
function looksLikeDate(run: string): boolean {
  if (run.length !== 8) return false;
  const year = (y: number) => y >= 2020 && y <= 2099;
  const month = (m: number) => m >= 1 && m <= 12;
  const day = (d: number) => d >= 1 && d <= 32; // BS months run to 32 days
  const n = (a: number, b: number) => Number(run.slice(a, b));
  return (
    (year(n(0, 4)) && month(n(4, 6)) && day(n(6, 8))) ||
    (day(n(0, 2)) && month(n(2, 4)) && year(n(4, 8)))
  );
}

function isMobile(run: string): boolean {
  return (run.length === 10 && /^9[78]/.test(run)) || (run.length === 13 && /^9779[78]/.test(run));
}

function isLandline(run: string): boolean {
  return run.length >= 8 && run.length <= 9 && run.startsWith("0");
}

function isBankAccount(run: string): boolean {
  return run.length >= 12 && run.length <= 16 && !isMobile(run);
}

/** Digit runs in normalised text that are neither dates nor amounts. A mobile-shaped run is never an amount. */
function candidateRuns(text: string): string[] {
  const runs: string[] = [];
  for (const m of text.matchAll(DIGIT_RUN)) {
    const run = m[0];
    if (looksLikeDate(run)) continue;
    if (!isMobile(run) && AMOUNT_PREFIX.test(text.slice(0, m.index))) continue;
    runs.push(run);
  }
  return runs;
}

/** Layer 2 rules over already-prepared text. Payment first: it is the most specific. */
function matchRules(text: string): Match | null {
  const runs = candidateRuns(text);

  const payWord = text.match(PAYMENT_WORD);
  if (payWord && runs.some((r) => r.length >= 6)) return { kind: "payment", match: payWord[0] };
  const bank = runs.find(isBankAccount);
  if (bank) return { kind: "payment", match: bank };

  const code = text.match(COUNTRY_CODE);
  if (code) return { kind: "phone", match: code[0] };
  const phone = runs.find((r) => isMobile(r) || isLandline(r));
  if (phone) return { kind: "phone", match: phone };
  if (PHONE_INTENT.test(text) && runs.length > 1) {
    const dictated = runs.join("");
    if (isMobile(dictated)) return { kind: "phone", match: dictated };
  }

  const email = text.match(EMAIL);
  if (email) return { kind: "link", match: email[0] };
  const noEmail = text.replace(EMAIL, " ");
  const url = noEmail.match(URL);
  if (url) return { kind: "link", match: url[0] };
  const handle = noEmail.match(HANDLE) ?? noEmail.match(IG_HANDLE);
  if (handle) return { kind: "link", match: handle[0] };
  const app = text.match(APP_WORD) ?? text.match(CONTEXT_APP_WORD);
  if (app) return { kind: "link", match: app[0] };
  const emailWord = text.match(EMAIL_WORD);
  if (emailWord) return { kind: "link", match: emailWord[0] };

  return null;
}

/** Whether the body alone could be part of a split number or a trigger. */
function contributes(prepared: string): boolean {
  return (
    /\d/.test(prepared) ||
    PAYMENT_WORD.test(prepared) ||
    APP_WORD.test(prepared) ||
    PHONE_INTENT.test(prepared) ||
    COUNTRY_CODE.test(prepared)
  );
}

const held = (layer: CheckLayer, m: Match): CheckResult => ({
  ok: false,
  layer,
  reason: REASONS[m.kind],
  match: m.match,
});

/** Layers 1 to 3. `context` is earlier messages in the thread, oldest first. */
export function check(body: string, context: string[] = []): CheckResult {
  const prepared = prepare(body);

  const own = matchRules(prepared);
  if (own) return held(2, own);

  if (context.length > 0 && contributes(prepared)) {
    const joined = prepare(context.slice(-5).join(" ") + " " + body);
    const together = matchRules(joined);
    if (together) return held(3, together);
  }

  return { ok: true };
}

/** Layers 1 to 4. The classifier only runs when the rules pass; if it throws, the rules result stands. */
export async function checkWithIntent(
  body: string,
  context: string[] = [],
  classifier: IntentClassifier = noIntentClassifier,
  threshold = 0.8,
): Promise<CheckResult> {
  const result = check(body, context);
  if (!result.ok) return result;
  let score: number;
  try {
    score = await classifier.score(body, context);
  } catch {
    return result;
  }
  if (score >= threshold) return { ok: false, layer: 4, reason: REASONS.intent };
  return { ok: true };
}
