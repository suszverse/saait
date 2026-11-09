import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as s from "./db/schema";
import { seed } from "./db/seed";
import { nearestPlaces, noFallback, searchPlaces, type Place, type PlaceFallback } from "./places";

const client = postgres(process.env.DATABASE_URL_TEST ?? "", { max: 1, onnotice: () => {} });
const db = drizzle(client, { schema: s, casing: "snake_case" });
const TRAFFIC_CHOWK = { lat: 27.7006, lng: 83.4483 };

beforeAll(async () => {
  await client`truncate table users, cities, service_categories, auspicious_dates restart identity cascade`;
  await seed(db);
});
afterAll(async () => {
  await client.end();
});

describe("searchPlaces", () => {
  it("'traf' finds Traffic Chowk first", async () => {
    const places = await searchPlaces(db, { q: "traf" });
    expect(places[0]).toMatchObject({ slug: "traffic-chowk-butwal", name: "Traffic Chowk, Butwal", nameNp: "ट्राफिक चोक, बुटवल", kind: "chowk", district: "Rupandehi" });
    expect(places[0].lat).toBeCloseTo(TRAFFIC_CHOWK.lat);
    expect(places[0].lng).toBeCloseTo(TRAFFIC_CHOWK.lng);
    expect(places.map((p) => p.slug)).toContain("hotel-avenue-traffic-chowk");
  });

  it("matches the Devanagari name", async () => {
    const places = await searchPlaces(db, { q: "बुटवल" });
    expect(places.length).toBeGreaterThan(0);
    expect(places[0].slug).toBe("butwal");
    expect(places.every((p) => p.nameNp?.includes("बुटवल"))).toBe(true);
  });

  it("is case-insensitive, ranks prefix matches before substring ones and caps at 8", async () => {
    const places = await searchPlaces(db, { q: "ChOwK" });
    expect(places.length).toBeGreaterThanOrEqual(3);
    expect(places.length).toBeLessThanOrEqual(8);
    const rank = (p: Place) => (p.name.toLowerCase().startsWith("chowk") ? 0 : /(^|[\s,/-])chowk/.test(p.name.toLowerCase()) ? 1 : 2);
    const ranks = places.map(rank);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    expect(places.map((p) => p.slug)).toEqual(expect.arrayContaining(["traffic-chowk-butwal", "milan-chowk-butwal", "hotel-avenue-traffic-chowk"]));
    const butwal = await searchPlaces(db, { q: "butwal" });
    expect(butwal.length).toBe(8);
    expect(butwal[0].slug).toBe("butwal");
  });

  it("returns only the public shape", async () => {
    const [p] = await searchPlaces(db, { q: "tansen" });
    expect(Object.keys(p).sort()).toEqual(["district", "kind", "lat", "lng", "name", "nameNp", "slug"]);
  });

  it("does not treat like wildcards as wildcards", async () => {
    expect(await searchPlaces(db, { q: "%" })).toEqual([]);
    expect(await searchPlaces(db, { q: "   " })).toEqual([]);
  });

  it("asks the fallback only when the table has nothing", async () => {
    const remote: Place = { slug: "pokhara", name: "Pokhara", nameNp: "पोखरा", kind: "municipality", lat: 28.2096, lng: 83.9856, district: "Kaski" };
    const fallback: PlaceFallback = { search: vi.fn(async () => [remote]) };
    expect(await searchPlaces(db, { q: "traf" }, fallback)).not.toContainEqual(remote);
    expect(fallback.search).not.toHaveBeenCalled();
    expect(await searchPlaces(db, { q: "pokh" }, fallback)).toEqual([remote]);
    expect(fallback.search).toHaveBeenCalledWith("pokh");
    expect(await searchPlaces(db, { q: "pokh" })).toEqual([]);
    expect(await noFallback.search("pokh")).toEqual([]);
  });
});

describe("nearestPlaces", () => {
  it("puts Traffic Chowk at 0 km first and orders by distance", async () => {
    const near = await nearestPlaces(db, TRAFFIC_CHOWK);
    expect(near).toHaveLength(5);
    expect(near[0]).toMatchObject({ slug: "traffic-chowk-butwal", distanceKm: 0 });
    const km = near.map((p) => p.distanceKm);
    expect(km).toEqual([...km].sort((a, b) => a - b));
    expect(km.every((d) => d === Math.round(d * 10) / 10)).toBe(true);
  });

  it("never lists a district and honours n", async () => {
    const near = await nearestPlaces(db, { lat: 27.6, lng: 83.4 }, 20);
    expect(near).toHaveLength(20);
    expect(near.some((p) => p.kind === "district")).toBe(false);
    expect(near.some((p) => p.slug === "rupandehi")).toBe(false);
  });
});
