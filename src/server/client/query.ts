/**
 * The client flow keeps its state in the URL (point, radius, date, category,
 * band), so every screen is shareable and works without JavaScript. Each
 * field is parsed on its own with zod, so one bad value falls back to its
 * default without discarding the others.
 *
 * lat and lng are parsed as a pair: half a point is no point, so a bad or
 * missing half sends both back to Traffic Chowk. A legacy `city` param from
 * old links is tolerated and ignored.
 */
import { z } from "zod";
import { BUDGET_BANDS, DEFAULT_PLACE, DEFAULT_RADIUS_KM, NEPAL_LAT, NEPAL_LNG, type BudgetBand, type SearchQuery } from "../search";
import { addDays, isIsoDate, todayInNepal, type IsoDate } from "@/lib/nepali-date";

type Raw = Record<string, string | string[] | undefined>;

/** Browsing and booking both open two years ahead (bookings.MAX_DAYS_AHEAD). */
export const BROWSE_DAYS_AHEAD = 730;

const slug = z.string().regex(/^[a-z0-9-]{1,40}$/);
const band = z.enum(Object.keys(BUDGET_BANDS) as [BudgetBand, ...BudgetBand[]]);
const point = z.object({
  lat: z.coerce.number().min(NEPAL_LAT.min).max(NEPAL_LAT.max),
  lng: z.coerce.number().min(NEPAL_LNG.min).max(NEPAL_LNG.max),
});
const radius = z.coerce.number().min(5).max(100);
const place = z.string().trim().min(1).max(80);

export function parseClientQuery(raw: Raw, now = new Date()): SearchQuery {
  const one = (k: string) => (typeof raw[k] === "string" ? (raw[k] as string) : undefined);
  const today = todayInNepal(now);
  const last = addDays(today, BROWSE_DAYS_AHEAD);
  const d = one("date");
  const date: IsoDate = d && isIsoDate(d) && d >= today && d <= last ? d : today;
  const pt = point.safeParse({ lat: one("lat"), lng: one("lng") }).data;
  // A label only makes sense for the point it came with.
  const label = pt ? place.safeParse(one("place")).data : DEFAULT_PLACE.label;
  return {
    lat: pt?.lat ?? DEFAULT_PLACE.lat,
    lng: pt?.lng ?? DEFAULT_PLACE.lng,
    radiusKm: radius.safeParse(one("radius")).data ?? DEFAULT_RADIUS_KM,
    ...(label ? { place: label } : {}),
    date,
    category: slug.safeParse(one("category")).data ?? "wedding-photo",
    band: band.safeParse(one("band")).data ?? "any",
  };
}

export function queryString(q: Partial<SearchQuery>): string {
  const p = new URLSearchParams();
  if (q.lat != null && q.lng != null) {
    p.set("lat", String(q.lat));
    p.set("lng", String(q.lng));
  }
  if (q.place) p.set("place", q.place);
  if (q.radiusKm != null && q.radiusKm !== DEFAULT_RADIUS_KM) p.set("radius", String(q.radiusKm));
  if (q.date) p.set("date", q.date);
  if (q.category) p.set("category", q.category);
  if (q.band && q.band !== "any") p.set("band", q.band);
  return p.toString();
}
