import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fromBs } from "@/lib/nepali-date";
import { rupees } from "@/lib/money";
import * as s from "./db/schema";
import { seed } from "./db/seed";
import { getVerifiedProvider, slotsLeft } from "./providers";
import { compareResults, nearestBusinesses, searchFreeOnDate, searchQuery } from "./search";

const client = postgres(process.env.DATABASE_URL_TEST ?? "", { max: 1, onnotice: () => {} });
const db = drizzle(client, { schema: s, casing: "snake_case" });
const FALGUN_12 = fromBs({ year: 2083, month: 11, day: 12 });
const FALGUN_13 = fromBs({ year: 2083, month: 11, day: 13 });
const q = (over: Record<string, string> = {}) => searchQuery.parse({ date: FALGUN_12, category: "wedding-photo", ...over });
const TANSEN = { lat: "27.8673", lng: "83.5467" };

beforeAll(async () => {
  await client`truncate table users, cities, service_categories, auspicious_dates restart identity cascade`;
  await seed(db);
});
afterAll(async () => {
  await client.end();
});

describe("free-on-date search", () => {
  it("lists only verified providers", async () => {
    const { results } = await searchFreeOnDate(db, q());
    const slugs = results.map((r) => r.slug);
    expect(slugs).toContain("shrestha-studio");
    expect(slugs).toContain("prakash-films");
    for (const hidden of ["kiran-rai", "ramesh-thapa-films", "lumbini-wedding-co", "sabina-shrestha"]) expect(slugs).not.toContain(hidden);
  });

  it("lists only subscribed businesses, never crew or a lapsed studio", async () => {
    const slugs = (await searchFreeOnDate(db, q())).results.map((r) => r.slug);
    // Verified freelancers are crew hired by businesses; they have no public listing.
    for (const crew of ["golden-hour-nepal", "pixel-and-palki"]) expect(slugs).not.toContain(crew);
    // A verified studio on the free plan is not listed either.
    expect(slugs).not.toContain("siddhartha-photo");
    const [crew] = await db.select().from(s.providerProfiles).where(eq(s.providerProfiles.slug, "golden-hour-nepal"));
    expect(crew.kycStatus).toBe("verified");
    expect(await getVerifiedProvider(db, "golden-hour-nepal")).toBeNull();
    expect(await getVerifiedProvider(db, "siddhartha-photo")).toBeNull();
    expect(await getVerifiedProvider(db, "shrestha-studio")).not.toBeNull();
  });

  it("drops a provider whose day is blocked", async () => {
    const slugs = (await searchFreeOnDate(db, q())).results.map((r) => r.slug);
    expect(slugs).not.toContain("himal-captures");
    const nextDay = (await searchFreeOnDate(db, q({ date: FALGUN_13 }))).results.map((r) => r.slug);
    expect(nextDay).toContain("himal-captures");
  });

  it("orders by rating then distance, never by price", async () => {
    const { results } = await searchFreeOnDate(db, q());
    for (let i = 1; i < results.length; i++) expect(compareResults(results[i - 1], results[i])).toBeLessThanOrEqual(0);
    // Anita (Rs 22,000, 4.7) is cheaper than Prakash (Rs 48,000, 4.8) and must come after.
    const idx = (slug: string) => results.findIndex((r) => r.slug === slug);
    expect(idx("prakash-films")).toBeLessThan(idx("anita-gurung-photography"));
  });

  it("filters by budget band without reordering", async () => {
    const all = (await searchFreeOnDate(db, q())).results;
    const mid = (await searchFreeOnDate(db, q({ band: "30k-60k" }))).results;
    expect(mid.every((r) => r.fromPrice >= rupees(30_000) && r.fromPrice < rupees(60_000))).toBe(true);
    expect(mid.map((r) => r.slug)).toEqual(all.filter((r) => mid.some((m) => m.slug === r.slug)).map((r) => r.slug));
  });

  it("shows the peak surcharge only on a wedding date", async () => {
    const onSaait = (await searchFreeOnDate(db, q())).results.find((r) => r.slug === "shrestha-studio")!;
    expect(onSaait.fromPrice).toBe(rupees(35_000));
    expect(onSaait.fromPeakSurcharge).toBe(rupees(5_000));
    const offDay = (await searchFreeOnDate(db, q({ date: FALGUN_13 }))).results.find((r) => r.slug === "shrestha-studio")!;
    expect(offDay.fromPeakSurcharge).toBe(0);
  });

  it("searches from Traffic Chowk by default and reports each distance", async () => {
    const { place, results } = await searchFreeOnDate(db, q());
    expect(place).toEqual({ label: "Traffic Chowk, Butwal", lat: 27.7006, lng: 83.4483, radiusKm: 30 });
    for (const r of results) {
      expect(Number.isFinite(r.distanceKm)).toBe(true);
      expect(r.distanceKm).toBe(Math.round(r.distanceKm * 10) / 10);
    }
    expect(results.find((r) => r.slug === "shrestha-studio")!.distanceKm).toBe(0);
    const prakash = results.find((r) => r.slug === "prakash-films")!;
    expect(prakash.distanceKm).toBeGreaterThan(20);
    expect(prakash.distanceKm).toBeLessThan(25);
  });

  it("includes a provider only inside both the client's radius and its own reach", async () => {
    const near = (await searchFreeOnDate(db, q({ radiusKm: "5" }))).results.map((r) => r.slug);
    expect(near).toContain("shrestha-studio");
    expect(near).not.toContain("prakash-films");
    expect(near).not.toContain("rupandehi-weddings");
    expect(near).not.toContain("tansen-frames");
    // Lumbini is 29 km out: inside a 30 km radius but past the 25 km reach floor.
    const wide = (await searchFreeOnDate(db, q())).results.map((r) => r.slug);
    expect(wide).toContain("tansen-frames");
    expect(wide).not.toContain("lens-of-lumbini");
    const tansen = (await searchFreeOnDate(db, q({ ...TANSEN, place: "Tansen Bazaar" }))).results.map((r) => r.slug);
    expect(tansen).toContain("tansen-frames");
    expect(tansen).not.toContain("lens-of-lumbini");
  });

  it("rejects a malformed query at the boundary", () => {
    expect(() => searchQuery.parse({ date: "2027-02-30" })).toThrow();
    expect(() => searchQuery.parse({ date: FALGUN_12, band: "cheapest" })).toThrow();
    expect(() => searchQuery.parse({ date: FALGUN_12, lat: "51.5", lng: "-0.1" })).toThrow();
    expect(() => searchQuery.parse({ date: FALGUN_12, lat: "27.7", lng: "83.4", radiusKm: "2" })).toThrow();
    expect(() => searchQuery.parse({ date: FALGUN_12, place: "x".repeat(81) })).toThrow();
    expect(searchQuery.parse({ date: FALGUN_12 })).toMatchObject({ lat: 27.7006, lng: 83.4483, radiusKm: 30 });
  });
});

describe("nearest businesses", () => {
  it("returns the three closest listed studios sorted by distance", async () => {
    const near = await nearestBusinesses(db, { lat: 27.8673, lng: 83.5467 });
    expect(near).toHaveLength(3);
    expect(near[0].slug).toBe("tansen-frames");
    expect(near[0].distanceKm).toBe(0);
    for (let i = 1; i < near.length; i++) expect(near[i - 1].distanceKm).toBeLessThanOrEqual(near[i].distanceKm);
    for (const b of near) expect(["golden-hour-nepal", "pixel-and-palki", "siddhartha-photo", "kiran-rai"]).not.toContain(b.slug);
    expect(await nearestBusinesses(db, { lat: 27.484, lng: 83.276 }, 1)).toMatchObject([{ slug: "lens-of-lumbini", distanceKm: 0 }]);
  });
});

describe("capacity", () => {
  it("counts bookings and live holds, not expired ones", async () => {
    const [anita] = await db.select().from(s.providerProfiles).where(eq(s.providerProfiles.slug, "anita-gurung-photography"));
    const [pkg] = await db.select().from(s.packages).where(eq(s.packages.providerId, anita.id));
    const [client1] = await db.insert(s.users).values({ phone: "+9779800009999" }).returning();
    const now = new Date("2027-02-01T00:00:00Z");
    expect((await slotsLeft(db, [anita.id], FALGUN_12, now)).get(anita.id)).toBe(1);
    await db.insert(s.dateHolds).values({ providerId: anita.id, packageId: pkg.id, clientId: client1.id, day: FALGUN_12, expiresAt: new Date(now.getTime() - 1) });
    expect((await slotsLeft(db, [anita.id], FALGUN_12, now)).get(anita.id)).toBe(1);
    await db.insert(s.dateHolds).values({ providerId: anita.id, packageId: pkg.id, clientId: client1.id, day: FALGUN_12, expiresAt: new Date(now.getTime() + 3_600_000) });
    expect((await slotsLeft(db, [anita.id], FALGUN_12, now)).get(anita.id)).toBe(0);
    const slugs = (await searchFreeOnDate(db, q(), now)).results.map((r) => r.slug);
    expect(slugs).not.toContain("anita-gurung-photography");
  });
});
