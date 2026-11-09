/**
 * Integration tests against the migrated test database (pnpm db:reset:test).
 * They prove the constraints the plan relies on are enforced by Postgres,
 * not just by application code.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as s from "./schema";

const url = process.env.DATABASE_URL_TEST;
const client = postgres(url ?? "", { max: 1, onnotice: () => {} });
const db = drizzle(client, { schema: s, casing: "snake_case" });

let providerUserA: string;
let providerUserB: string;
let clientId: string;

async function rejects(p: Promise<unknown>, pattern: RegExp) {
  let err: unknown;
  try {
    await p;
  } catch (e) {
    err = e;
  }
  expect(err, "expected the database to reject this").toBeTruthy();
  const e = err as { message?: string; cause?: { constraint_name?: string; message?: string } };
  expect(`${e.message} ${e.cause?.constraint_name ?? ""} ${e.cause?.message ?? ""}`).toMatch(pattern);
}

beforeAll(async () => {
  if (!url || !/_test(\?|$)/.test(url)) throw new Error("DATABASE_URL_TEST must end in _test");
  await client`truncate table users, cities, places, service_categories, auspicious_dates restart identity cascade`;
  const [a, b, c] = await db
    .insert(s.users)
    .values([
      { phone: "+9779800000001", role: "provider" },
      { phone: "+9779800000002", role: "provider" },
      { phone: "+9779800000003", role: "client" },
    ])
    .returning({ id: s.users.id });
  providerUserA = a.id;
  providerUserB = b.id;
  clientId = c.id;
});

afterAll(async () => {
  await client.end();
});

describe("schema constraints", () => {
  it("allows one account per phone", async () => {
    await rejects(db.insert(s.users).values({ phone: "+9779800000001" }), /users_phone_uq|duplicate/);
  });

  it("enforces one provider profile per PAN and per citizenship number", async () => {
    await db.insert(s.providerProfiles).values({
      userId: providerUserA,
      slug: "a",
      displayName: "A",
      alias: "Crew A1-001",
      panNumber: "301245678",
      citizenshipNumber: "27-01-71-00412",
    });
    await rejects(
      db.insert(s.providerProfiles).values({ userId: providerUserB, slug: "b", displayName: "B", alias: "Crew B1-001", panNumber: "301245678" }),
      /provider_pan_uq|duplicate/,
    );
    await rejects(
      db.insert(s.providerProfiles).values({
        userId: providerUserB,
        slug: "b",
        displayName: "B",
        alias: "Crew B1-001",
        citizenshipNumber: "27-01-71-00412",
      }),
      /provider_citizenship_uq|duplicate/,
    );
  });

  it("treats the same citizenship number typed differently as a duplicate", async () => {
    for (const variant of ["27017100412", " 27-01-71-00412", "२७-०१-७१-००४१२"]) {
      await rejects(
        db.insert(s.providerProfiles).values({ userId: providerUserB, slug: "b", displayName: "B", alias: "Crew B1-001", citizenshipNumber: variant }),
        /provider_citizenship_uq|duplicate/,
      );
    }
  });

  it("rejects identity numbers that normalise to nothing", async () => {
    await rejects(
      db.insert(s.providerProfiles).values({ userId: providerUserB, slug: "b", displayName: "B", alias: "Crew B1-001", citizenshipNumber: "abc" }),
      /citizenship_has_digits|check/,
    );
    await rejects(
      db.insert(s.providerProfiles).values({ userId: providerUserB, slug: "b", displayName: "B", alias: "Crew B1-001", passportNumber: "---" }),
      /passport_has_characters|check/,
    );
  });

  it("enforces one profile per passport, ignoring case and spacing", async () => {
    await db.update(s.providerProfiles).set({ passportNumber: "PA 1234567" }).where(sqlEq(s.providerProfiles.slug, "a"));
    await rejects(
      db.insert(s.providerProfiles).values({ userId: providerUserB, slug: "b", displayName: "B", alias: "Crew B1-001", passportNumber: "pa1234567" }),
      /provider_passport_uq|duplicate/,
    );
  });

  it("allows many providers without a PAN yet", async () => {
    await db.insert(s.providerProfiles).values({ userId: providerUserB, slug: "b", displayName: "B", alias: "Crew B1-001" });
  });

  it("requires an alias for freelancers and keeps aliases unique", async () => {
    const [u] = await db.insert(s.users).values({ phone: "+9779800000004", role: "provider" }).returning({ id: s.users.id });
    await rejects(db.insert(s.providerProfiles).values({ userId: u.id, slug: "c", displayName: "C" }), /freelancer_has_alias|check/);
    await rejects(
      db.insert(s.providerProfiles).values({ userId: u.id, slug: "c", displayName: "C", alias: "Crew A1-001" }),
      /provider_alias_uq|duplicate/,
    );
    await db.insert(s.providerProfiles).values({ userId: u.id, slug: "c", displayName: "Studio C", kind: "studio" });
    await rejects(db.update(s.providerProfiles).set({ dayRate: -1 }).where(sqlEq(s.providerProfiles.slug, "c")), /day_rate_non_negative|check/);
  });

  it("records each terms version once per user", async () => {
    await db.insert(s.agreementAcceptances).values({ userId: clientId, version: "2026-11" });
    await rejects(db.insert(s.agreementAcceptances).values({ userId: clientId, version: "2026-11" }), /agreement_acceptances_user_version_uq|duplicate/);
    await db.insert(s.agreementAcceptances).values({ userId: clientId, version: "2026-12" });
  });

  it("rejects a PAN that is not nine digits", async () => {
    await rejects(
      db.update(s.providerProfiles).set({ panNumber: "30124" }).where(sqlEq(s.providerProfiles.slug, "b")),
      /pan_nine_digits|check/,
    );
  });

  it("stores money as integer paisa and keeps a booking's sums consistent", async () => {
    const [p] = await db.select().from(s.providerProfiles).limit(1);
    const [cat] = await db.insert(s.serviceCategories).values({ slug: "wedding-photo", name: "Wedding photography", shortName: "Wedding photo" }).returning();
    const [pkg] = await db
      .insert(s.packages)
      .values({ providerId: p.id, categoryId: cat.id, name: "Standard", summary: "x", price: 6_500_000, coverageHours: 10, deliveryDays: 30, peakSurcharge: 800_000 })
      .returning();
    expect(pkg.price).toBe(6_500_000);
    expect(pkg.currency).toBe("NPR");
    expect(pkg.depositPercent).toBe(25);

    const base = {
      clientId,
      providerId: p.id,
      packageId: pkg.id,
      day: "2027-02-24",
      venue: "Siddhartha Party Palace, Butwal",
      contactPhone: "+9779800000003",
      packageName: "Standard",
      packagePrice: 6_500_000,
      peakSurcharge: 800_000,
      agreedTotal: 7_300_000,
      depositAmount: 1_825_000,
      bookingFee: 292_000,
      balanceDue: 5_475_000,
      cancellationPolicy: [{ minDaysBefore: 31, refundPercent: 100 }],
    };
    const [b] = await db.insert(s.bookings).values({ ...base, code: "SA-0001" }).returning();
    expect(b.urgency).toBe("standard");
    expect(b.status).toBe("held");
    await rejects(db.insert(s.bookings).values({ ...base, code: "SA-0002", balanceDue: 5_000_000 }), /booking_money_consistent|check/);
    await rejects(
      db.insert(s.bookings).values({ ...base, code: "SA-0003", packagePrice: 100, peakSurcharge: 0, agreedTotal: 100, depositAmount: 200, balanceDue: -100 }),
      /booking_money_non_negative|check/,
    );
  });

  it("rejects negative surcharges and non-NPR currency", async () => {
    const [pkg] = await db.select().from(s.packages).limit(1);
    await rejects(db.update(s.packages).set({ peakSurcharge: -500 }).where(sqlEq(s.packages.id, pkg.id)), /price_positive|check/);
    await rejects(db.update(s.packages).set({ currency: "USD" }).where(sqlEq(s.packages.id, pkg.id)), /packages_currency|check/);
  });

  it("requires a hold to come from exactly one of a package or an offer", async () => {
    const [p] = await db.select().from(s.providerProfiles).limit(1);
    const [pkg] = await db.select().from(s.packages).limit(1);
    const expiresAt = new Date(Date.now() + 86_400_000);
    await db.insert(s.dateHolds).values({ providerId: p.id, packageId: pkg.id, clientId, day: "2027-02-26", expiresAt });
    await rejects(db.insert(s.dateHolds).values({ providerId: p.id, clientId, day: "2027-02-26", expiresAt }), /hold_has_source|check/);
    const [offer] = await db
      .insert(s.offers)
      .values({ providerId: p.id, clientId, day: "2027-02-27", description: "Custom", price: 4_400_000, createdById: clientId, expiresAt })
      .returning();
    await db.insert(s.dateHolds).values({ providerId: p.id, offerId: offer.id, clientId, day: "2027-02-27", expiresAt });
  });

  it("keeps places inside Nepal's bounding box", async () => {
    await rejects(
      db.insert(s.places).values({ slug: "nowhere", name: "Nowhere", kind: "chowk", lat: 40, lng: 83.4483, district: "Rupandehi" }),
      /places_in_nepal|check/,
    );
    const [p] = await db
      .insert(s.places)
      .values({ slug: "traffic-chowk-butwal", name: "Traffic Chowk", nameNp: "ट्राफिक चोक", kind: "chowk", lat: 27.7006, lng: 83.4483, district: "Rupandehi" })
      .returning();
    expect(p.kind).toBe("chowk");
    expect(p.source).toBe("seed");
    expect(p.cityId).toBeNull();
  });

  it("makes payments idempotent per gateway reference", async () => {
    const [b] = await db.select().from(s.bookings).limit(1);
    const row = { bookingId: b.id, gateway: "manual", method: "esewa", gatewayRef: "ref-1", amount: 2_117_000 };
    await db.insert(s.payments).values(row);
    await rejects(db.insert(s.payments).values(row), /payments_gateway_ref_uq|duplicate/);
  });

  it("requires a thread to have two different parties and dedupes threads with no day", async () => {
    const [p] = await db.select().from(s.providerProfiles).limit(1);
    await rejects(
      db.insert(s.chatThreads).values({ kind: "client_business", aUserId: clientId, bUserId: clientId, providerId: p.id }),
      /thread_two_parties|check/,
    );
    const pair = { kind: "client_business" as const, aUserId: clientId, bUserId: providerUserA, providerId: p.id };
    const [t] = await db.insert(s.chatThreads).values(pair).returning();
    expect(t.lastMessageAt).toBeNull();
    await rejects(db.insert(s.chatThreads).values(pair), /chat_threads_pair_day_uq|duplicate/);
    await db.insert(s.chatThreads).values({ ...pair, day: "2027-02-24" });
  });

  it("requires a message to belong to a thread or an enquiry", async () => {
    const [t] = await db.select().from(s.chatThreads).limit(1);
    await rejects(db.insert(s.messages).values({ senderId: clientId, body: "namaste" }), /message_has_home|check/);
    const [m] = await db.insert(s.messages).values({ threadId: t.id, senderId: clientId, body: "namaste" }).returning();
    expect(m.status).toBe("delivered");
    expect(m.enquiryId).toBeNull();
  });

  it("records a contact reveal once per booking and viewer", async () => {
    const [b] = await db.select().from(s.bookings).limit(1);
    await db.insert(s.contactReveals).values({ bookingId: b.id, viewerId: clientId });
    await rejects(db.insert(s.contactReveals).values({ bookingId: b.id, viewerId: clientId }), /contact_reveals_once_uq|duplicate/);
    await db.insert(s.contactReveals).values({ bookingId: b.id, viewerId: providerUserA });
  });

  it("keeps the reward ledger append-only", async () => {
    const [b] = await db.select().from(s.bookings).limit(1);
    const [row] = await db
      .insert(s.rewardLedger)
      .values({ userId: clientId, kind: "points", amount: 50, reason: "on_time", bookingId: b.id })
      .returning();
    expect(row.amount).toBe(50);
    await rejects(db.update(s.rewardLedger).set({ amount: 60 }).where(sqlEq(s.rewardLedger.id, row.id)), /append|reward_ledger/);
    await rejects(db.delete(s.rewardLedger).where(sqlEq(s.rewardLedger.id, row.id)), /append|reward_ledger/);
    await rejects(db.insert(s.rewardLedger).values({ userId: clientId, kind: "points", amount: 0, reason: "reset" }), /reward_amount_nonzero|check/);
  });

  it("writes each earning event once but lets spend rows repeat", async () => {
    const [b] = await db.select().from(s.bookings).limit(1);
    const earn = { userId: clientId, kind: "points" as const, amount: 100, reason: "booking_completed" as const, bookingId: b.id };
    await db.insert(s.rewardLedger).values(earn);
    await rejects(db.insert(s.rewardLedger).values(earn), /reward_ledger_once_uq|duplicate/);
    // The same event for credit is a different row.
    await db.insert(s.rewardLedger).values({ ...earn, kind: "credit", amount: 10_000 });
    const spend = { userId: clientId, kind: "credit" as const, amount: -5_000, reason: "checkout_spend" as const, bookingId: b.id };
    await db.insert(s.rewardLedger).values(spend);
    await db.insert(s.rewardLedger).values(spend);
  });

  it("records a referral once per referee and never to oneself", async () => {
    await rejects(db.insert(s.referrals).values({ referrerId: clientId, refereeId: clientId }), /referral_two_people|check/);
    await db.insert(s.referrals).values({ referrerId: providerUserA, refereeId: clientId });
    await rejects(db.insert(s.referrals).values({ referrerId: providerUserB, refereeId: clientId }), /referrals_referee_id_unique|duplicate/);
    await db.update(s.users).set({ referralCode: "SAAIT-A1" }).where(sqlEq(s.users.id, providerUserA));
    await rejects(db.update(s.users).set({ referralCode: "SAAIT-A1" }).where(sqlEq(s.users.id, providerUserB)), /users_referral_code_unique|duplicate/);
  });

  it("caps applied credit at the booking fee", async () => {
    const [b] = await db.select().from(s.bookings).limit(1);
    expect(b.creditApplied).toBe(0);
    await db.update(s.bookings).set({ creditApplied: b.bookingFee }).where(sqlEq(s.bookings.id, b.id));
    await rejects(db.update(s.bookings).set({ creditApplied: b.bookingFee + 1 }).where(sqlEq(s.bookings.id, b.id)), /booking_credit_within_fee|check/);
    await rejects(db.update(s.bookings).set({ creditApplied: -1 }).where(sqlEq(s.bookings.id, b.id)), /booking_credit_within_fee|check/);
  });
});

import { eq as sqlEq } from "drizzle-orm";
