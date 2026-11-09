/**
 * Place lookup for the venue and search-area pickers.
 *
 * The places table is the seeded Rupandehi cluster (districts down to chowks
 * and venues). Typing matches name or Devanagari name case-insensitively,
 * ranked prefix first, then word-start, then anywhere in the name, so "traf"
 * puts Traffic Chowk above Hotel Avenue, Traffic Chowk. A geocoder is only
 * consulted when the table has nothing; it sits behind PlaceFallback so tests
 * and Phase 1 run with no network at all.
 *
 * Nothing here stores a client's position. Nearest-place lookups are computed
 * and returned; the coordinates are never written.
 */
import { ilike, ne, or } from "drizzle-orm";
import * as s from "./db/schema";
import type { Db } from "./providers";
import { haversineKm, type LatLng } from "./search";

export type Place = {
  slug: string;
  name: string;
  nameNp: string | null;
  kind: (typeof s.placeKindEnum.enumValues)[number];
  lat: number;
  lng: number;
  district: string;
};

export type NearbyPlace = Place & { distanceKm: number };

/** Boundary for an external geocoder (Nominatim later). Called only when the table yields nothing. */
export interface PlaceFallback {
  search(q: string): Promise<Place[]>;
}

/** Phase 1 default: the table is the whole world. */
export const noFallback: PlaceFallback = { search: async () => [] };

export const PLACE_SEARCH_LIMIT = 8;
export const NEAREST_DEFAULT = 5;

/** Typed-text ties: the place most people mean by that name, towns before their venues. */
const KIND_ORDER: Record<Place["kind"], number> = { municipality: 0, chowk: 1, ward: 2, venue: 3, district: 4 };
/** Point ties (Butwal's centre is Traffic Chowk): the most specific place wins. */
const NEAREST_KIND_ORDER: Record<Place["kind"], number> = { venue: 0, chowk: 1, ward: 2, municipality: 3, district: 4 };

const round1 = (km: number) => Math.round(km * 10) / 10;

const toPlace = (r: typeof s.places.$inferSelect): Place => ({
  slug: r.slug,
  name: r.name,
  nameNp: r.nameNp,
  kind: r.kind,
  lat: r.lat,
  lng: r.lng,
  district: r.district,
});

/** 0 whole-name prefix, 1 start of a later word, 2 anywhere, 3 no match. */
function matchRank(value: string | null, needle: string): number {
  if (!value) return 3;
  const v = value.toLocaleLowerCase();
  if (v.startsWith(needle)) return 0;
  const at = v.indexOf(needle);
  if (at < 0) return 3;
  return /[\s,(/-]/.test(v[at - 1] ?? "") ? 1 : 2;
}

/** ilike treats % and _ as wildcards; the typed text must not. */
const escapeLike = (q: string) => q.replace(/[\\%_]/g, (c) => `\\${c}`);

export async function searchPlaces(db: Db, { q }: { q: string }, fallback: PlaceFallback = noFallback): Promise<Place[]> {
  const needle = q.trim().toLocaleLowerCase();
  if (!needle) return [];
  const pattern = `%${escapeLike(needle)}%`;
  const rows = await db
    .select()
    .from(s.places)
    .where(or(ilike(s.places.name, pattern), ilike(s.places.nameNp, pattern)));
  if (rows.length === 0) return (await fallback.search(q.trim())).slice(0, PLACE_SEARCH_LIMIT);
  return rows
    .map((r) => ({ place: toPlace(r), rank: Math.min(matchRank(r.name, needle), matchRank(r.nameNp, needle)) }))
    .sort((a, b) => a.rank - b.rank || KIND_ORDER[a.place.kind] - KIND_ORDER[b.place.kind] || a.place.name.localeCompare(b.place.name))
    .slice(0, PLACE_SEARCH_LIMIT)
    .map((x) => x.place);
}

/** Closest named places to a point, districts excluded (their centroid is not somewhere to stand). */
export async function nearestPlaces(db: Db, at: LatLng, n = NEAREST_DEFAULT): Promise<NearbyPlace[]> {
  const rows = await db.select().from(s.places).where(ne(s.places.kind, "district"));
  return rows
    .map((r) => ({ place: toPlace(r), km: haversineKm(at, { lat: r.lat, lng: r.lng }) }))
    .sort((a, b) => a.km - b.km || NEAREST_KIND_ORDER[a.place.kind] - NEAREST_KIND_ORDER[b.place.kind] || a.place.name.localeCompare(b.place.name))
    .slice(0, n)
    .map(({ place, km }) => ({ ...place, distanceKm: round1(km) }));
}
