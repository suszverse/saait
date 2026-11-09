import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { rupees } from "@/lib/money";
import { confirmReport, dismissReport, ModerationError } from "../chat/moderation";
import * as s from "../db/schema";
import {
  BOOKING_POINTS,
  CREW_JOB_POINTS,
  FIVE_STAR_POINTS,
  NO_SHOW_POINTS,
  onBookingCompleted,
  onCrewJobCompleted,
  onNoShow,
  onReportConfirmed,
  onReviewLeft,
  REFERRAL_CREDIT,
  REPORT_CREDIT,
  REVIEW_CREDIT,
} from "./earn";
import { creditBalance, pointsBalance } from "./ledger";

const client = postgres(process.env.DATABASE_URL_TEST ?? "", { max: 1, onnotice: () => {} });
const db = drizzle(client, { schema: s, casing: "snake_case" });

const NOW = new Date("2026-11-09T06:00:00Z");
const FROZEN = new Date(NOW.getTime() + 86_400_000);
const DAY = "2026-12-01";

let seq = 0;
async function newUser(over: Partial<typeof s.users.$inferInsert> = {}) {
  const [u] = await db
    .insert(s.users)
    .values({ phone: `+97798${String(60_000_000 + ++seq)}`, role: "client", ...over })
    .returning();
  return u;
}

async function newProvider(kind: "freelancer" | "studio" = "studio", over: Partial<typeof s.users.$inferInsert> = {}) {
  const user = await newUser({ role: "provider", ...over });
  const [profile] = await db
    .insert(s.providerProfiles)
    .values({ userId: user.id, slug: `p-${seq}`, displayName: `Provider ${seq}`, kind, alias: kind === "freelancer" ? `Crew T1-${seq}` : null })
    .returning();
  return { user, profile };
}

async function newBooking(clientId: string, providerId: string, over: Partial<typeof s.bookings.$inferInsert> = {}) {
  const [b] = await db
    .insert(s.bookings)
    .values({
      code: `SA-${1000 + ++seq}`,
      clientId,
      providerId,
      day: DAY,
      status: "completed",
      venue: "Siddhartha Party Palace, Butwal",
      contactPhone: "+9779800000000",
      packageName: "Standard",
      packagePrice: rupees(70_000),
      agreedTotal: rupees(70_000),
      depositAmount: rupees(17_500),
      bookingFee: rupees(2_800),
      balanceDue: rupees(52_500),
      cancellationPolicy: [],
      ...over,
    })
    .returning();
  return b;
}

async function newReview(authorId: string, subjectId: string, bookingId: string, rating: number) {
  const [r] = await db.insert(s.reviews).values({ bookingId, authorId, subjectId, rating }).returning();
  return r;
}

async function newReport(reporterId: string, subjectProviderId: string) {
  const [r] = await db.insert(s.reports).values({ reporterId, subjectProviderId, reason: "Asked for payment outside Saait" }).returning();
  return r;
}

async function newCrewJob(businessId: string, freelancerId: string) {
  const [j] = await db.insert(s.crewJobs).values({ businessId, freelancerId, day: DAY, role: "second_shooter", dayRate: rupees(8_000), status: "completed" }).returning();
  return j;
}

const rowsFor = (userId: string) => db.select().from(s.rewardLedger).where(eq(s.rewardLedger.userId, userId));

/** Another agent may reset the shared test database mid-run; wait for the tables to come back. */
async function truncate() {
  for (let attempt = 0; ; attempt++) {
    try {
      await client`truncate table users restart identity cascade`;
      return;
    } catch (e) {
      if (attempt >= 20 || !/does not exist/.test(String(e))) throw e;
      await new Promise((r) => setTimeout(r, 500));
    }
  }
}

beforeAll(truncate);
afterAll(async () => {
  await client.end();
});

describe("onBookingCompleted", () => {
  it("credits the client a quarter of the fee paid and gives the provider 100 points", async () => {
    const c = await newUser();
    const { user: pu, profile } = await newProvider();
    // Fee Rs 2,800 with Rs 800 of credit applied: the client paid Rs 2,000, so earns Rs 500.
    const b = await newBooking(c.id, profile.id, { creditApplied: rupees(800) });
    const r = await onBookingCompleted(db, b.id, NOW);
    expect(r).toEqual({ clientCredit: rupees(500), credit: "inserted", providerPoints: "inserted", referral: "skipped" });
    expect(await creditBalance(db, c.id, NOW)).toBe(rupees(500));
    expect(await pointsBalance(db, pu.id)).toBe(BOOKING_POINTS);
  });

  it("writes no credit row when credit covered the whole fee", async () => {
    const c = await newUser();
    const { profile } = await newProvider();
    const b = await newBooking(c.id, profile.id, { creditApplied: rupees(2_800) });
    const r = await onBookingCompleted(db, b.id, NOW);
    expect(r.credit).toBe("skipped");
    expect(await rowsFor(c.id)).toHaveLength(0);
  });

  it("is idempotent: a replay adds no rows", async () => {
    const c = await newUser();
    const { user: pu, profile } = await newProvider();
    const b = await newBooking(c.id, profile.id);
    await onBookingCompleted(db, b.id, NOW);
    const again = await onBookingCompleted(db, b.id, NOW);
    expect(again.credit).toBe("repeat");
    expect(again.providerPoints).toBe("repeat");
    expect(await rowsFor(c.id)).toHaveLength(1);
    expect(await rowsFor(pu.id)).toHaveLength(1);
  });

  it("pays Rs 300 to both sides of a referral on the referee's first completed booking only", async () => {
    const referrer = await newUser();
    const referee = await newUser();
    await db.insert(s.referrals).values({ referrerId: referrer.id, refereeId: referee.id });
    const { profile } = await newProvider();
    const first = await newBooking(referee.id, profile.id);
    expect((await onBookingCompleted(db, first.id, NOW)).referral).toBe("inserted");
    expect(await creditBalance(db, referrer.id, NOW)).toBe(REFERRAL_CREDIT);
    // Referee: Rs 700 (25% of Rs 2,800) plus the referral bonus.
    expect(await creditBalance(db, referee.id, NOW)).toBe(rupees(700) + REFERRAL_CREDIT);

    const second = await newBooking(referee.id, profile.id);
    expect((await onBookingCompleted(db, second.id, NOW)).referral).toBe("repeat");
    expect(await creditBalance(db, referrer.id, NOW)).toBe(REFERRAL_CREDIT);
    expect((await rowsFor(referrer.id)).length).toBe(1);
  });

  it("still pays the referral when two bookings were completed before the events fire", async () => {
    const referrer = await newUser();
    const referee = await newUser();
    await db.insert(s.referrals).values({ referrerId: referrer.id, refereeId: referee.id });
    const { profile } = await newProvider();
    const first = await newBooking(referee.id, profile.id);
    const second = await newBooking(referee.id, profile.id);
    // Both already marked completed (a backfill or a retry), events fire afterwards.
    expect((await onBookingCompleted(db, second.id, NOW)).referral).toBe("inserted");
    expect((await onBookingCompleted(db, first.id, NOW)).referral).toBe("repeat");
    expect((await rowsFor(referrer.id)).length).toBe(1);
    expect(await creditBalance(db, referrer.id, NOW)).toBe(REFERRAL_CREDIT);
  });

  it("still credits the client when the provider's points are frozen, and reports the refusal", async () => {
    const c = await newUser();
    const { user: pu, profile } = await newProvider("studio", { pointsFrozenUntil: FROZEN });
    const b = await newBooking(c.id, profile.id);
    const r = await onBookingCompleted(db, b.id, NOW);
    expect(r.credit).toBe("inserted");
    expect(r.providerPoints).toBe("frozen");
    expect(await rowsFor(pu.id)).toHaveLength(0);
  });

  it("rejects an unknown booking", async () => {
    await expect(onBookingCompleted(db, crypto.randomUUID(), NOW)).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("onReviewLeft", () => {
  it("credits the author Rs 100 for any rating and adds 20 points to the provider on five stars", async () => {
    const c = await newUser();
    const { user: pu, profile } = await newProvider();
    const b = await newBooking(c.id, profile.id);
    const three = await newReview(c.id, pu.id, b.id, 3);
    expect(await onReviewLeft(db, three.id, NOW)).toEqual({ credit: "inserted", fiveStar: "skipped" });
    expect(await pointsBalance(db, pu.id)).toBe(0);

    const b2 = await newBooking(c.id, profile.id);
    const five = await newReview(c.id, pu.id, b2.id, 5);
    expect(await onReviewLeft(db, five.id, NOW)).toEqual({ credit: "inserted", fiveStar: "inserted" });
    expect(await creditBalance(db, c.id, NOW)).toBe(2 * REVIEW_CREDIT);
    expect(await pointsBalance(db, pu.id)).toBe(FIVE_STAR_POINTS);

    expect(await onReviewLeft(db, five.id, NOW)).toEqual({ credit: "repeat", fiveStar: "repeat" });
    expect(await rowsFor(c.id)).toHaveLength(2);
    expect(await rowsFor(pu.id)).toHaveLength(1);
  });

  it("moves no points when a business rates its client five stars", async () => {
    const c = await newUser();
    const { user: pu, profile } = await newProvider();
    const b = await newBooking(c.id, profile.id);
    const r = await newReview(pu.id, c.id, b.id, 5);
    expect(await onReviewLeft(db, r.id, NOW)).toEqual({ credit: "inserted", fiveStar: "skipped" });
    expect(await rowsFor(c.id)).toHaveLength(0);
    expect(await creditBalance(db, pu.id, NOW)).toBe(REVIEW_CREDIT);
  });
});

describe("onReportConfirmed", () => {
  it("credits the reporter Rs 200 once", async () => {
    const c = await newUser();
    const { profile } = await newProvider();
    const rep = await newReport(c.id, profile.id);
    expect(await onReportConfirmed(db, rep.id, NOW)).toEqual({ credit: "inserted" });
    expect(await onReportConfirmed(db, rep.id, NOW)).toEqual({ credit: "repeat" });
    expect(await creditBalance(db, c.id, NOW)).toBe(REPORT_CREDIT);
    expect(await rowsFor(c.id)).toHaveLength(1);
  });
});

describe("onNoShow", () => {
  it("takes 200 points even while frozen, once per booking or crew job", async () => {
    const c = await newUser();
    const { user: pu, profile } = await newProvider("studio", { pointsFrozenUntil: FROZEN });
    const b = await newBooking(c.id, profile.id);
    expect(await onNoShow(db, { providerUserId: pu.id, bookingId: b.id }, NOW)).toEqual({ points: "inserted" });
    expect(await onNoShow(db, { providerUserId: pu.id, bookingId: b.id }, NOW)).toEqual({ points: "repeat" });
    expect(await pointsBalance(db, pu.id)).toBe(-NO_SHOW_POINTS);

    const { profile: crew } = await newProvider("freelancer");
    const job = await newCrewJob(profile.id, crew.id);
    expect(await onNoShow(db, { providerUserId: pu.id, crewJobId: job.id }, NOW)).toEqual({ points: "inserted" });
    expect(await pointsBalance(db, pu.id)).toBe(-2 * NO_SHOW_POINTS);
  });

  it("needs exactly one of bookingId or crewJobId", async () => {
    const { user: pu } = await newProvider();
    await expect(onNoShow(db, { providerUserId: pu.id }, NOW)).rejects.toThrow();
    await expect(onNoShow(db, { providerUserId: pu.id, bookingId: crypto.randomUUID(), crewJobId: crypto.randomUUID() }, NOW)).rejects.toThrow();
  });
});

describe("onCrewJobCompleted", () => {
  it("gives 100 points to the business and the freelancer, once", async () => {
    const { user: bu, profile: business } = await newProvider("studio");
    const { user: fu, profile: crew } = await newProvider("freelancer");
    const job = await newCrewJob(business.id, crew.id);
    expect(await onCrewJobCompleted(db, job.id, NOW)).toEqual({ business: "inserted", freelancer: "inserted" });
    expect(await onCrewJobCompleted(db, job.id, NOW)).toEqual({ business: "repeat", freelancer: "repeat" });
    expect(await pointsBalance(db, bu.id)).toBe(CREW_JOB_POINTS);
    expect(await pointsBalance(db, fu.id)).toBe(CREW_JOB_POINTS);
  });

  it("refuses the frozen side and still pays the other", async () => {
    const { profile: business } = await newProvider("studio");
    const { user: fu, profile: crew } = await newProvider("freelancer", { pointsFrozenUntil: FROZEN });
    const job = await newCrewJob(business.id, crew.id);
    expect(await onCrewJobCompleted(db, job.id, NOW)).toEqual({ business: "inserted", freelancer: "frozen" });
    expect(await rowsFor(fu.id)).toHaveLength(0);
  });
});

describe("confirmReport and dismissReport", () => {
  it("only an operator or admin may decide", async () => {
    const c = await newUser();
    const { user: pu, profile } = await newProvider();
    const rep = await newReport(c.id, profile.id);
    for (const actor of [c, pu]) {
      await expect(confirmReport(db, actor, rep.id, NOW)).rejects.toMatchObject({ code: "forbidden" });
      await expect(dismissReport(db, actor, rep.id, NOW)).rejects.toMatchObject({ code: "forbidden" });
    }
    const [still] = await db.select().from(s.reports).where(eq(s.reports.id, rep.id));
    expect(still.status).toBe("open");
    expect(await rowsFor(c.id)).toHaveLength(0);
  });

  it("confirming closes the report, credits the reporter and writes an audit row", async () => {
    const operator = await newUser({ role: "operator" });
    const c = await newUser();
    const { profile } = await newProvider();
    const rep = await newReport(c.id, profile.id);
    expect(await confirmReport(db, operator, rep.id, NOW)).toEqual({ credit: "inserted" });
    const [r] = await db.select().from(s.reports).where(eq(s.reports.id, rep.id));
    expect(r.status).toBe("confirmed");
    expect(r.decidedById).toBe(operator.id);
    expect(r.decidedAt?.toISOString()).toBe(NOW.toISOString());
    expect(await creditBalance(db, c.id, NOW)).toBe(REPORT_CREDIT);
    const logs = await db.select().from(s.auditLog).where(eq(s.auditLog.subjectId, rep.id));
    expect(logs.map((l) => l.action)).toEqual(["report.confirmed"]);
    // Already decided.
    await expect(confirmReport(db, operator, rep.id, NOW)).rejects.toBeInstanceOf(ModerationError);
    await expect(dismissReport(db, operator, rep.id, NOW)).rejects.toMatchObject({ code: "wrong_state" });
  });

  it("dismissing closes the report without credit", async () => {
    const admin = await newUser({ role: "admin" });
    const c = await newUser();
    const { profile } = await newProvider();
    const rep = await newReport(c.id, profile.id);
    await dismissReport(db, admin, rep.id, NOW);
    const [r] = await db.select().from(s.reports).where(eq(s.reports.id, rep.id));
    expect(r.status).toBe("dismissed");
    expect(r.decidedById).toBe(admin.id);
    expect(await rowsFor(c.id)).toHaveLength(0);
    const logs = await db.select().from(s.auditLog).where(eq(s.auditLog.subjectId, rep.id));
    expect(logs.map((l) => l.action)).toEqual(["report.dismissed"]);
    await expect(confirmReport(db, admin, crypto.randomUUID(), NOW)).rejects.toMatchObject({ code: "not_found" });
  });
});
