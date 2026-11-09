/**
 * Free-on-date search, system plan section 5 and design principle 1.
 *
 * Who appears: verified businesses on a paid plan offering the category,
 * within reach of the chosen point, with a slot left on the day. Freelancers
 * are never listed (docs/proposals/leakage-and-rewards.md section 13).
 *
 * The point is a lat/lng (a place the client picked, or their location) with
 * a radius. A provider is in reach when it lies inside the client's radius
 * and the client lies inside the provider's own service radius.
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

/** Where a search starts when the client has not picked a place yet. */
export const DEFAULT_PLACE = { label: "Traffic Chowk, Butwal", lat: 27.7006, lng: 83.4483 } as const;
export const DEFAULT_RADIUS_KM = 30;

/** Nepal's bounding box; the places table enforces the same (places_in_nepal). */
export const NEPAL_LAT = { min: 26.3, max: 30.5 } as const;
export const NEPAL_LNG = { min: 80.0, max: 88.3 } as const;

/** zod at the boundary: everything here arrives from the URL. */
export const searchQuery = z.object({
  lat: z.coerce.number().min(NEPAL_LAT.min).max(NEPAL_LAT.max).default(DEFAULT_PLACE.lat),
  lng: z.coerce.number().min(NEPAL_LNG.min).max(NEPAL_LNG.max).default(DEFAULT_PLACE.lng),
  radiusKm: z.coerce.number().min(5).max(100).default(DEFAULT_RADIUS_KM),
  place: z.string().trim().max(80).optional(),
  date: z.string().refine(isIsoDate, "Not a date"),
  category: z.string().regex(/^[a-z0-9-]{1,40}$/).default("wedding-photo"),
  band: z.enum(Object.keys(BUDGET_BANDS) as [BudgetBand, ...BudgetBand[]]).default("any"),
});
export type SearchQuery = z.infer<typeof searchQuery>;

/** Reach from the chosen point: the provider's radius, with a 25 km floor ("Butwal and 25 km"). */
export const MIN_REACH_KM = 25;

export type LatLng = { lat: number; lng: number };

/** The point a search ran from, for the results header. */
export type SearchPlace = LatLng & { label: string; radiusKm: number };

/** Label falls back to the coordinates so the header never reads blank. */
export function searchPlace(q: Pick<SearchQuery, "lat" | "lng" | "radiusKm" | "place">): SearchPlace {
  const label = q.place || (q.lat === DEFAULT_PLACE.lat && q.lng === DEFAULT_PLACE.lng ? DEFAULT_PLACE.label : `${q.lat.toFixed(4)}, ${q.lng.toFixed(4)}`);
  return { label, lat: q.lat, lng: q.lng, radiusKm: q.radiusKm };
}

const round1 = (km: number) => Math.round(km * 10) / 10;

/** A provider without a map pin is placed at their home city's centre. */
function providerPin(p: { lat: number | null; lng: number | null }, homeCity: LatLng | null): LatLng | null {
  if (p.lat != null && p.lng != null) return { lat: p.lat, lng: p.lng };
  return homeCity ? { lat: homeCity.lat, lng: homeCity.lng } : null;
}

export function haversineKm(a: LatLng, b: LatLng): number {
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
  const place = searchPlace(q);
  const [category] = await db.select().from(s.serviceCategories).where(eq(s.serviceCategories.slug, q.category));
  const saait = await isSaait(db, q.date as IsoDate);
  if (!category) return { place, category: null, saait, results: [] as SearchResult[] };

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
    .map((e) => {
      const pin = providerPin(e.p, e.homeCity);
      return { ...e, distanceKm: pin ? haversineKm(place, pin) : Infinity };
    })
    .filter((e) => e.distanceKm <= q.radiusKm && e.distanceKm <= Math.max(e.p.serviceRadiusKm, MIN_REACH_KM));

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
      distanceKm: round1(e.distanceKm),
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
  return { place, category, saait, results };
}

export type NearbyBusiness = Pick<SearchResult, "id" | "slug" | "name" | "cityName" | "distanceKm" | "rating" | "ratingCount">;

/**
 * The n client-visible businesses closest to a point, whatever the date or
 * radius. Shown when a search comes back empty so the client has somewhere
 * to go next.
 */
export async function nearestBusinesses(db: Db, point: LatLng, n = 3): Promise<NearbyBusiness[]> {
  const rows = await db
    .select({ p: s.providerProfiles, homeCity: s.cities })
    .from(s.providerProfiles)
    .leftJoin(s.cities, eq(s.cities.id, s.providerProfiles.homeCityId))
    .where(clientVisible());
  return rows
    .map(({ p, homeCity }) => {
      const pin = providerPin(p, homeCity);
      return { id: p.id, slug: p.slug, name: p.displayName, cityName: homeCity?.name ?? "", distanceKm: pin ? haversineKm(point, pin) : Infinity, rating: p.ratingAvg, ratingCount: p.ratingCount };
    })
    .filter((b) => Number.isFinite(b.distanceKm))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, n)
    .map((b) => ({ ...b, distanceKm: round1(b.distanceKm) }));
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

