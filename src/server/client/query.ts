/**
 * The client flow keeps its state in the URL (city, date, category, band),
 * so every screen is shareable and works without JavaScript. Each field is
 * parsed on its own with zod, so one bad value falls back to its default
 * without discarding the others.
 */
import { z } from "zod";
import { BUDGET_BANDS, type BudgetBand, type SearchQuery } from "../search";
import { addDays, isIsoDate, todayInNepal, type IsoDate } from "@/lib/nepali-date";

type Raw = Record<string, string | string[] | undefined>;

/** Browsing and booking both open two years ahead (bookings.MAX_DAYS_AHEAD). */
export const BROWSE_DAYS_AHEAD = 730;

const slug = z.string().regex(/^[a-z0-9-]{1,40}$/);
const band = z.enum(Object.keys(BUDGET_BANDS) as [BudgetBand, ...BudgetBand[]]);

export function parseClientQuery(raw: Raw, now = new Date()): SearchQuery {
  const one = (k: string) => (typeof raw[k] === "string" ? (raw[k] as string) : undefined);
  const today = todayInNepal(now);
  const last = addDays(today, BROWSE_DAYS_AHEAD);
  const d = one("date");
  const date: IsoDate = d && isIsoDate(d) && d >= today && d <= last ? d : today;
  return {
    city: slug.safeParse(one("city")).data ?? "butwal",
    date,
    category: slug.safeParse(one("category")).data ?? "wedding-photo",
    band: band.safeParse(one("band")).data ?? "any",
  };
}

export function queryString(q: Partial<SearchQuery>): string {
  const p = new URLSearchParams();
  if (q.city) p.set("city", q.city);
  if (q.date) p.set("date", q.date);
  if (q.category) p.set("category", q.category);
  if (q.band && q.band !== "any") p.set("band", q.band);
  return p.toString();
}
