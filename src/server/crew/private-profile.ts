/**
 * Keeps a crew profile anonymous. Freelancers are shown to businesses as
 * "Crew B3-417" with a headline, bio and roles; anything in those fields that
 * lets a business reach them off-platform, or pin them to a studio or a street,
 * is rejected with a reason the provider can act on. Pure; no I/O.
 */

import { normalise } from "../text/normalise";

export type PrivateProfileField = "headline" | "bio" | "roles";
export type PrivateProfileCheck = { ok: true } | { ok: false; field: PrivateProfileField; reason: string };

const REASONS = {
  phone: "Please leave out phone numbers; businesses get your number when they hire you.",
  email: "Please leave out email addresses; businesses reach you through Saait chat.",
  url: "Please leave out links and website addresses.",
  handle: "Please leave out social media handles.",
  business: "Please describe yourself, not a studio or company; crew profiles carry no business name.",
  place: "Please keep your location to the city; leave out wards, chowks, streets and house numbers.",
} as const;

// Nepal mobiles (97x/98x + 7), landlines (01 or 0xx + 6–7 digits), country code,
// then any 7+ digit run as the catch-all. Runs in normalised text, so Devanagari
// digits, separators and spelled-out numbers have already been folded.
const PHONE = [/(?<!\d)9[78]\d{8}(?!\d)/, /(?<!\d)0(?:1\d{7}|\d{2}\d{6,7})(?!\d)/, /\+?977\d{6,}/, /\d{7,}/];
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const URL = /\bhttps?:\/\/|\bwww\.|\b[\w-]+\.(?:com|np|net|org|io|co|in|me|info|biz|site|app|online|shop)\b/;
// A handle is @ followed by a word; the email check runs first so "a@b.com" is reported as an email.
const HANDLE = /(?<![\w.+-])@[a-z0-9_.]{2,}/;
const BUSINESS = /\b(?:studio|studios|films?|photography|productions?|production house|pvt|ltd|p\. ?ltd|company|wedding co)\b/;
const PLACE = [
  /\bward(?:\s*(?:no\.?|number))?\s*\d+\b/, // "ward 5", "ward no. 5"
  /वडा/, // Devanagari "ward"
  /\b(?:chowk|tole|marg|galli|gali|road|street)\b/,
  /\b(?:house|home|ghar)\s*(?:no\.?|number|#)?\s*\d+\b/, // "house no 12"
];

// Year ranges ("2081-2083", "2019 to 2024") are experience, not numbers to call.
// Blank them before normalise would merge the two years into one 8-digit run.
const YEAR_RANGE = /\b(19|20)\d{2}\s*(?:-|–|to|देखि)\s*(19|20)\d{2}\b/g;

function reasonFor(text: string): string | null {
  const t = normalise(text.replace(YEAR_RANGE, " "));
  if (PHONE.some((p) => p.test(t))) return REASONS.phone;
  if (EMAIL.test(t)) return REASONS.email;
  if (URL.test(t)) return REASONS.url;
  if (HANDLE.test(t)) return REASONS.handle;
  if (BUSINESS.test(t)) return REASONS.business;
  if (PLACE.some((p) => p.test(t))) return REASONS.place;
  return null;
}

export function checkPrivateProfile({ headline, bio, roles }: { headline?: string; bio?: string; roles?: string[] }): PrivateProfileCheck {
  const fields: [PrivateProfileField, string[]][] = [
    ["headline", headline ? [headline] : []],
    ["bio", bio ? [bio] : []],
    ["roles", roles ?? []],
  ];
  for (const [field, texts] of fields) {
    for (const text of texts) {
      const reason = reasonFor(text);
      if (reason) return { ok: false, field, reason };
    }
  }
  return { ok: true };
}
