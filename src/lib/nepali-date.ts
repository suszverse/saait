/**
 * Bikram Sambat dates for display. Storage is always the Gregorian calendar
 * date as "YYYY-MM-DD" (a Postgres `date`), so nothing depends on a converter
 * table at query time. Nepali first, Gregorian in small type where it matters.
 */
import NepaliDate from "nepali-date-converter";

export const BS_MONTHS = [
  "Baisakh", "Jestha", "Asar", "Shrawan", "Bhadra", "Asoj",
  "Kartik", "Mangsir", "Poush", "Magh", "Falgun", "Chaitra",
] as const;
export const BS_MONTHS_NP = [
  "बैशाख", "जेठ", "असार", "साउन", "भदौ", "असोज",
  "कार्तिक", "मंसिर", "पुस", "माघ", "फागुन", "चैत",
] as const;

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const DOW_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
const NP_DIGITS = "०१२३४५६७८९";

export type IsoDate = string; // YYYY-MM-DD, Gregorian

export type BsDate = { year: number; month: number; day: number }; // month 1-12

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Noon local time avoids any day shift from the host time zone. */
function isoToJs(iso: IsoDate): Date {
  const m = ISO.exec(iso);
  if (!m) throw new RangeError(`Not an ISO date: ${iso}`);
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
  if (d.getMonth() !== Number(m[2]) - 1) throw new RangeError(`Not a real date: ${iso}`);
  return d;
}

function jsToIso(d: Date): IsoDate {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function isIsoDate(s: string): s is IsoDate {
  try {
    isoToJs(s);
    return true;
  } catch {
    return false;
  }
}

export function toBs(iso: IsoDate): BsDate {
  let n: NepaliDate;
  try {
    n = new NepaliDate(isoToJs(iso));
  } catch (e) {
    if (e instanceof RangeError) throw e;
    throw new RangeError(`Date outside the BS converter range: ${iso}`);
  }
  return { year: n.getYear(), month: n.getMonth() + 1, day: n.getDate() };
}

/** Throws RangeError for impossible BS dates such as Falgun 31 or month 13. */
export function fromBs(bs: BsDate): IsoDate {
  const { year, month, day } = bs;
  if (![year, month, day].every(Number.isInteger) || month < 1 || month > 12 || day < 1 || day > 32) {
    throw new RangeError(`Not a BS date: ${year}-${month}-${day}`);
  }
  let iso: IsoDate;
  try {
    const js = new NepaliDate(year, month - 1, day).toJsDate();
    iso = jsToIso(new Date(js.getFullYear(), js.getMonth(), js.getDate(), 12));
  } catch {
    throw new RangeError(`BS date out of supported range: ${year}-${month}-${day}`);
  }
  const back = toBs(iso);
  if (back.year !== year || back.month !== month || back.day !== day) {
    throw new RangeError(`Not a real BS date: ${BS_MONTHS[month - 1]} ${day}, ${year}`);
  }
  return iso;
}

export function toNepaliDigits(n: number | string): string {
  return String(n).replace(/\d/g, (d) => NP_DIGITS[Number(d)]);
}

/** "Falgun 12" */
export function bsDayMonth(iso: IsoDate): string {
  const b = toBs(iso);
  return `${BS_MONTHS[b.month - 1]} ${b.day}`;
}

/** "फागुन १२" */
export function bsDayMonthNp(iso: IsoDate): string {
  const b = toBs(iso);
  return `${BS_MONTHS_NP[b.month - 1]} ${toNepaliDigits(b.day)}`;
}

/** "Falgun 2083" */
export function bsMonthYear(iso: IsoDate): string {
  const b = toBs(iso);
  return `${BS_MONTHS[b.month - 1]} ${b.year}`;
}

/** "Wednesday, Falgun 12, 2083 · Feb 24, 2027" */
export function bsLongWithGregorian(iso: IsoDate): string {
  const js = isoToJs(iso);
  const b = toBs(iso);
  const greg = js.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `${DOW_LONG[js.getDay()]}, ${BS_MONTHS[b.month - 1]} ${b.day}, ${b.year} · ${greg}`;
}

/** "Feb 24" for SMS. */
export function gregorianShort(iso: IsoDate): string {
  return isoToJs(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function dayOfWeek(iso: IsoDate): (typeof DOW)[number] {
  return DOW[isoToJs(iso).getDay()];
}

export function addDays(iso: IsoDate, days: number): IsoDate {
  const d = isoToJs(iso);
  d.setDate(d.getDate() + days);
  return jsToIso(d);
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((isoToJs(to).getTime() - isoToJs(from).getTime()) / 86_400_000);
}

/** Today in Nepal, whatever the server's time zone. */
export function todayInNepal(now: Date = new Date()): IsoDate {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kathmandu" }).format(now);
}
