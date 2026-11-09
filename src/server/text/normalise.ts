/**
 * Text normaliser for contact detection in chat. Flattens the ways a phone
 * number can be disguised (Devanagari digits, spaced or dotted digits,
 * letter look-alikes, spelled-out digits in English or Nepali) so the later
 * checker only has to look for runs of ASCII digits. Pure; no I/O.
 */

const ZERO_WIDTH = /[​-‍﻿]/g;
const UNICODE_DIGIT = /\p{Nd}/gu;
// Separators that people put between digits to break up a number.
const DIGIT_SEPARATOR = /(?<=\d)[\s.\-_/()]+(?=\d)/g;
// Letter look-alikes sitting between digits, separators allowed either side.
// S is riskier, so it needs three digits on one side and at least one on the other.
const SEP = "[\\s.\\-_/()]*";
const HOMOGLYPH = new RegExp(`(?<=\\d${SEP})[oOlI|]+(?=${SEP}\\d)`, "g");
const HOMOGLYPH_S = new RegExp(`(?<=\\d{3}${SEP})S(?=${SEP}\\d)|(?<=\\d${SEP})S(?=${SEP}\\d{3})`, "g");
const HOMOGLYPH_MAP: Record<string, string> = { o: "0", O: "0", l: "1", I: "1", "|": "1", S: "5" };

// Number words by digit. "oh" and "no" are weak: alone they are ordinary
// words, so a run made only of them is left as is.
const NUMBER_WORDS: Record<string, string> = {
  // English
  zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9",
  oh: "0",
  // Nepali, Devanagari
  "शून्य": "0", "एक": "1", "दुई": "2", "तीन": "3", "चार": "4", "पाँच": "5", "छ": "6", "सात": "7", "आठ": "8", "नौ": "9",
  // Nepali, romanised
  sunya: "0", ek: "1", dui: "2", tin: "3", teen: "3", char: "4", chaar: "4", panch: "5", paanch: "5",
  chha: "6", cha: "6", saat: "7", sat: "7", aath: "8", ath: "8", nau: "9", no: "9",
};
const WEAK_WORDS = new Set(["oh", "no"]);

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Longest first so "chaar" wins over "cha" + trailing letters.
const WORD_ALTERNATION = Object.keys(NUMBER_WORDS).sort((a, b) => b.length - a.length).map(escape).join("|");
// A token is a number word or a digit group; a run is two or more tokens
// separated by spaces, commas, dots or dashes, bounded by non-word characters.
const TOKEN = `(?:${WORD_ALTERNATION}|\\d+)`;
const WORD_RUN = new RegExp(
  `(?<![\\p{L}\\p{M}\\p{N}])${TOKEN}(?:[\\s,.\\-]+${TOKEN})+(?![\\p{L}\\p{M}\\p{N}])`,
  "giu",
);
const TOKEN_SPLIT = /[\s,.\-]+/;

/** Folds any Unicode decimal digit to ASCII by walking back to its block's zero. */
function foldDigit(ch: string): string {
  const cp = ch.codePointAt(0)!;
  let zero = cp;
  for (let k = 0; k < 9; k++) {
    const prev = String.fromCodePoint(zero - 1);
    if (!/\p{Nd}/u.test(prev)) break;
    zero--;
  }
  return String(cp - zero);
}

function convertRun(run: string): string {
  const tokens = run.split(TOKEN_SPLIT);
  const words = tokens.filter((t) => !/^\d+$/.test(t));
  if (words.length === 0) return run;
  const strong = words.some((w) => !WEAK_WORDS.has(w.toLowerCase()));
  // A weak word only counts when it sits between digit tokens ("98 oh 41").
  const weakBetweenDigits = tokens.some(
    (t, i) => WEAK_WORDS.has(t.toLowerCase()) && i > 0 && i < tokens.length - 1 && /^\d+$/.test(tokens[i - 1]) && /^\d+$/.test(tokens[i + 1]),
  );
  if (!strong && !weakBetweenDigits) return run;
  return tokens.map((t) => (/^\d+$/.test(t) ? t : NUMBER_WORDS[t.toLowerCase()] ?? t)).join("");
}

export function normalise(text: string): string {
  let s = text.normalize("NFKC").replace(ZERO_WIDTH, "");
  s = s.replace(UNICODE_DIGIT, foldDigit);
  s = s.replace(WORD_RUN, convertRun);
  s = s.replace(DIGIT_SEPARATOR, "");
  s = s.replace(HOMOGLYPH, (m) => m.replace(/./g, (c) => HOMOGLYPH_MAP[c] ?? c));
  s = s.replace(HOMOGLYPH_S, "5");
  // Homoglyph swaps can expose new digit-separator-digit gaps.
  s = s.replace(DIGIT_SEPARATOR, "");
  return s.toLowerCase();
}

/** Runs of 7+ digits in the normalised text; the checker's raw material. */
export function digitRuns(text: string): string[] {
  return normalise(text).match(/\d{7,}/g) ?? [];
}
