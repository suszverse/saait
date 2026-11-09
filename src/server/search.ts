/**
 * Free-on-date search, system plan section 5 and design principle 1.
 *
 * Who appears: verified businesses on a paid plan offering the category,
 * within reach of the chosen city, with a slot left on the day. Freelancers
 * are never listed (docs/proposals/leakage-and-rewards.md section 13).
 *
 * Order: availability (any slot left; all results qualify), then rating, then
 * distance. Never price. Budget bands filter by a provider's from-price for
 * the category but never rank inside the band by price.
 *
 * Phase 1 is one city cluster with tens of providers, so candidates are
 * loaded and filtered in memory; move distance to PostGIS when a second
 * cluster lands.
 */
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import * as s from "./db/schema";
import { clientVisible, isSaait, slotsLeft, type Db } from "./providers";
import { isIsoDate, type IsoDate } from "@/lib/nepali-date";
import { rupees, type Paisa } from "@/lib/money";

export const BUDGET_BANDS = {
  any: { label: "Any budget", min: null, max: null },
  "under-30k": { label: "Under Rs 30k", min: null, max: rupees(30_000) },
  "30k-60k": { label: "Rs 30k to 60k", min: rupees(30_000), max: rupees(60_000) },
  "60k-up": { label: "Rs 60k and up", min: rupees(60_000), max: null },
} as const satisfies Record<string, { label: string; min: Paisa | null; max: Paisa | null }>;
export type BudgetBand = keyof typeof BUDGET_BANDS;

/** zod at the boundary: everything here arrives from the URL. */
export const searchQuery = z.object({
  city: z.string().regex(/^[a-z0-9-]{1,40}$/).default("butwal"),
  date: z.string().refine(isIsoDate, "Not a date"),
  category: z.string().regex(/^[a-z0-9-]{1,40}$/).default("wedding-photo"),
  band: z.enum(Object.keys(BUDGET_BANDS) as [BudgetBand, ...BudgetBand[]]).default("any"),
});
export type SearchQuery = z.infer<typeof searchQuery>;

/** Reach from the chosen city: the provider's radius, with a 25 km floor ("Butwal and 25 km"). */
export const MIN_REACH_KM = 25;

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export type SearchResult = {
  id: string;
  slug: string;
  name: string;
  cityName: string;
  distanceKm: number;
  rating: number | null;
  ratingCount: number;
  completed: number;
  responseMinutes: number | null;
  slotsLeft: number;
  fromPrice: Paisa;
  fromPeakSurcharge: Paisa;
  tones: string[];
  verified: true;
};

export async function searchFreeOnDate(db: Db, q: SearchQuery, now = new Date()) {
  const [city] = await db.select().from(s.cities).where(eq(s.cities.slug, q.city));
  const [category] = await db.select().from(s.serviceCategories).where(eq(s.serviceCategories.slug, q.category));
  const saait = await isSaait(db, q.date as IsoDate);
  if (!city || !category) return { city: city ?? null, category: category ?? null, saait, results: [] as SearchResult[] };

  const rows = await db
    .select({ p: s.providerProfiles, pkg: s.packages, homeCity: s.cities })
    .from(s.providerProfiles)
    .innerJoin(s.packages, and(eq(s.packages.providerId, s.providerProfiles.id), eq(s.packages.categoryId, category.id), eq(s.packages.active, true)))
    .leftJoin(s.cities, eq(s.cities.id, s.providerProfiles.homeCityId))
    .where(clientVisible());

  const byProvider = new Map<string, { p: (typeof rows)[number]["p"]; homeCity: (typeof rows)[number]["homeCity"]; pkgs: (typeof rows)[number]["pkg"][] }>();
  for (const r of rows) {
    const e = byProvider.get(r.p.id) ?? { p: r.p, homeCity: r.homeCity, pkgs: [] };
    e.pkgs.push(r.pkg);
    byProvider.set(r.p.id, e);
  }

  const reachable = [...byProvider.values()]
    // A provider without a map pin is placed at their home city's centre.
    .map((e) => {
      const pin = e.p.lat != null && e.p.lng != null ? { lat: e.p.lat, lng: e.p.lng } : e.homeCity ? { lat: e.homeCity.lat, lng: e.homeCity.lng } : null;
      return { ...e, distanceKm: pin ? haversineKm(city, pin) : Infinity };
    })
    .filter((e) => e.distanceKm <= Math.max(e.p.serviceRadiusKm, MIN_REACH_KM));

  const slots = await slotsLeft(db, reachable.map((e) => e.p.id), q.date as IsoDate, now);
  const band = BUDGET_BANDS[q.band];

  const results: SearchResult[] = [];
  for (const e of reachable) {
    const left = slots.get(e.p.id) ?? 0;
    if (left <= 0) continue;
    // From-price is the provider's cheapest package in the category. It is
    // used for the band filter and the label only, never for ordering.
    const from = e.pkgs.reduce((m, k) => (k.price < m.price ? k : m), e.pkgs[0]);
    const fromPrice = from.price as Paisa;
    if (band.min != null && fromPrice < band.min) continue;
    if (band.max != null && fromPrice >= band.max) continue;
    results.push({
      id: e.p.id,
      slug: e.p.slug,
      name: e.p.displayName,
      cityName: e.homeCity?.name ?? "",
      distanceKm: Math.round(e.distanceKm * 10) / 10,
      rating: e.p.ratingAvg,
      ratingCount: e.p.ratingCount,
      completed: e.p.completedBookings,
      responseMinutes: e.p.responseMinutes,
      slotsLeft: left,
      fromPrice,
      fromPeakSurcharge: (saait ? from.peakSurcharge : 0) as Paisa,
      tones: e.p.portfolioTones,
      verified: true,
    });
  }

  results.sort(compareResults);
  return { city, category, saait, results };
}

/** Availability, then rating (unrated last), then distance. Price never appears here. */
export function compareResults(a: Pick<SearchResult, "slotsLeft" | "rating" | "distanceKm">, b: Pick<SearchResult, "slotsLeft" | "rating" | "distanceKm">) {
  const avail = Number(b.slotsLeft > 0) - Number(a.slotsLeft > 0);
  if (avail) return avail;
  const ra = a.rating ?? -1;
  const rb = b.rating ?? -1;
  if (rb !== ra) return rb - ra;
  return a.distanceKm - b.distanceKm;
}

/** Counts for a week strip without loading full results. */
export async function freeCount(db: Db, q: SearchQuery, now = new Date()) {
  return (await searchFreeOnDate(db, q, now)).results.length;
}

