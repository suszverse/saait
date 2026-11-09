import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as s from "./db/schema";
import { calendarBlocksAfterEnquiry, reportCounts } from "./signals";

const client = postgres(process.env.DATABASE_URL_TEST ?? "", { max: 1, onnotice: () => {} });
const db = drizzle(client, { schema: s, casing: "snake_case" });

const DAY = "2027-02-24";
const T0 = new Date("2026-11-01T06:00:00Z");
const hours = (n: number) => new Date(T0.getTime() + n * 3_600_000);

let business: { userId: string; providerId: string };
let clientId: string;

async function newProvider(phone: string, slug: string) {
  const [u] = await db.insert(s.users).values({ phone, role: "provider" }).returning();
  const [p] = await db.insert(s.providerProfiles).values({ userId: u.id, slug, displayName: slug, kind: "studio" }).returning();
  return { userId: u.id, providerId: p.id };
}

async function enquire(at: Date, day: string | null = DAY) {
  const [t] = await db
    .insert(s.chatThreads)
    .values({ kind: "client_business", aUserId: clientId, bUserId: business.userId, providerId: business.providerId, day, createdAt: at })
    .returning();
  return t;
}

async function block(at: Date, status: "open" | "blocked" = "blocked") {
  await db.insert(s.availabilityDays).values({ providerId: business.providerId, day: DAY, status, createdAt: at, updatedAt: at });
}

async function book() {
  await db.insert(s.bookings).values({
    code: "SA-0001",
    clientId,
    providerId: business.providerId,
    day: DAY,
    venue: "Siddhartha Party Palace, Butwal",
    contactPhone: "+9779800000003",
    packageName: "Standard",
    packagePrice: 6_500_000,
    agreedTotal: 6_500_000,
    depositAmount: 1_625_000,
    bookingFee: 260_000,
    balanceDue: 4_875_000,
    cancellationPolicy: [{ minDaysBefore: 31, refundPercent: 100 }],
  });
}

beforeEach(async () => {
  await client`truncate table users, cities, service_categories, auspicious_dates restart identity cascade`;
  business = await newProvider("+9779800000101", "anita-studio");
  const [c] = await db.insert(s.users).values({ phone: "+9779800000003", name: "Sita" }).returning();
  clientId = c.id;
});
afterAll(async () => {
  await client.end();
});

describe("calendarBlocksAfterEnquiry", () => {
  it("lists a day blocked after the client asked about it", async () => {
    const t = await enquire(hours(0));
    await block(hours(5));
    const list = await calendarBlocksAfterEnquiry(db);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      thread: { id: t.id },
      provider: { id: business.providerId, name: "anita-studio" },
      clientUserId: clientId,
      client: { name: "Sita", phone: "+9779800000003" },
      day: DAY,
    });
    expect(list[0].blockedAt.getTime()).toBe(hours(5).getTime());
    expect(list[0].enquiredAt.getTime()).toBe(hours(0).getTime());
  });

  it("is quiet when a booking explains the block", async () => {
    await enquire(hours(0));
    await block(hours(5));
    await book();
    expect(await calendarBlocksAfterEnquiry(db)).toHaveLength(0);
  });

  it("ignores a block made before the enquiry", async () => {
    await block(hours(0));
    await enquire(hours(5));
    expect(await calendarBlocksAfterEnquiry(db)).toHaveLength(0);
  });

  it("ignores open days, threads without a day and crew threads", async () => {
    await enquire(hours(0), null);
    await block(hours(5), "open");
    expect(await calendarBlocksAfterEnquiry(db)).toHaveLength(0);
    await client`update availability_days set status = 'blocked'`;
    const crew = await newProvider("+9779800000102", "crew");
    await db.insert(s.chatThreads).values({ kind: "business_crew", aUserId: business.userId, bUserId: crew.userId, providerId: business.providerId, day: DAY, createdAt: hours(0) });
    expect(await calendarBlocksAfterEnquiry(db)).toHaveLength(0);
  });

  it("honours since", async () => {
    await enquire(hours(0));
    await block(hours(5));
    expect(await calendarBlocksAfterEnquiry(db, { since: hours(6) })).toHaveLength(0);
    expect(await calendarBlocksAfterEnquiry(db, { since: hours(5) })).toHaveLength(1);
  });
});

describe("reportCounts", () => {
  it("counts open reports per business, skipping decided ones", async () => {
    const other = await newProvider("+9779800000102", "other");
    const report = (subjectProviderId: string, status: "open" | "confirmed" | "dismissed" = "open") =>
      db.insert(s.reports).values({ reporterId: clientId, subjectProviderId, reason: "Asked to pay outside", status });
    await report(business.providerId);
    await report(business.providerId);
    await report(business.providerId, "dismissed");
    await report(other.providerId);
    expect(await reportCounts(db)).toEqual([
      { provider: { id: business.providerId, name: "anita-studio" }, open: 2 },
      { provider: { id: other.providerId, name: "other" }, open: 1 },
    ]);
  });

  it("is empty with no open reports", async () => {
    expect(await reportCounts(db)).toEqual([]);
  });
});
