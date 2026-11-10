import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { rupees } from "@/lib/money";
import * as s from "./db/schema";
import { authorLabel, leaveReview, listReviewsFor, reply, ReviewError, reviewCrew } from "./reviews";
import { REVIEW_CREDIT } from "./rewards/earn";
import { creditBalance } from "./rewards/ledger";

const client = postgres(process.env.DATABASE_URL_TEST ?? "", { max: 1, onnotice: () => {} });
const db = drizzle(client, { schema: s, casing: "snake_case" });

/** Event day and a "now" 39 days later in Nepal, well inside the 60-day window. */
const DAY = "2026-10-01";
const NOW = new Date("2026-11-09T06:00:00Z");
/** 06:00Z is 11:45 in Kathmandu, so the Nepal date is the same as the UTC one. */
const DAY_60 = new Date("2026-11-30T06:00:00Z");
const DAY_61 = new Date("2026-12-01T06:00:00Z");

let seq = 0;
async function newUser(over: Partial<typeof s.users.$inferInsert> = {}) {
  const [u] = await db
    .insert(s.users)
    .values({ phone: `+97798${String(70_000_000 + ++seq)}`, role: "client", ...over })
    .returning();
  return u;
}

async function newProvider(kind: "freelancer" | "studio" = "studio") {
  const user = await newUser({ role: "provider" });
  const [profile] = await db
    .insert(s.providerProfiles)
    .values({ userId: user.id, slug: `rv-${seq}`, displayName: `Provider ${seq}`, kind, alias: kind === "freelancer" ? `Crew T2-${seq}` : null })
    .returning();
  return { user, profile };
}

async function newBooking(clientId: string, providerId: string, over: Partial<typeof s.bookings.$inferInsert> = {}) {
  const [b] = await db
    .insert(s.bookings)
    .values({
      code: `SA-${5000 + ++seq}`,
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

async function newCrewJob(businessId: string, freelancerId: string, status: "accepted" | "completed" = "completed") {
  const [j] = await db.insert(s.crewJobs).values({ businessId, freelancerId, day: DAY, role: "second_shooter", dayRate: rupees(8_000), status }).returning();
  return j;
}

const profileStats = async (id: string) => {
  const [p] = await db.select({ ratingAvg: s.providerProfiles.ratingAvg, ratingCount: s.providerProfiles.ratingCount }).from(s.providerProfiles).where(eq(s.providerProfiles.id, id));
  return p;
};

const code = (p: Promise<unknown>) => p.then(() => null, (e) => (e instanceof ReviewError ? e.code : e));

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

describe("leaveReview", () => {
  it("inserts, credits the author Rs 100 even for one star, and refreshes the provider's rating", async () => {
    const c = await newUser();
    const { user: pu, profile } = await newProvider();
    const b = await newBooking(c.id, profile.id);
    const { review, reward } = await leaveReview(db, c.id, b.code, { rating: 1, body: "  Late and rushed.  " }, NOW);
    expect(review.bookingId).toBe(b.id);
    expect(review.subjectId).toBe(pu.id);
    expect(review.rating).toBe(1);
    expect(review.body).toBe("Late and rushed.");
    expect(reward.credit).toBe("inserted");
    expect(await creditBalance(db, c.id, NOW)).toBe(REVIEW_CREDIT);
    expect(await profileStats(profile.id)).toEqual({ ratingAvg: 1, ratingCount: 1 });
  });

  it("averages to one decimal over all booking reviews of the provider", async () => {
    const { profile } = await newProvider();
    const c1 = await newUser();
    const c2 = await newUser();
    const c3 = await newUser();
    await leaveReview(db, c1.id, (await newBooking(c1.id, profile.id)).code, { rating: 5 }, NOW);
    await leaveReview(db, c2.id, (await newBooking(c2.id, profile.id)).code, { rating: 4 }, NOW);
    await leaveReview(db, c3.id, (await newBooking(c3.id, profile.id)).code, { rating: 4 }, NOW);
    expect(await profileStats(profile.id)).toEqual({ ratingAvg: 4.3, ratingCount: 3 });
  });

  it("accepts day 60 and refuses day 61", async () => {
    const { profile } = await newProvider();
    const c1 = await newUser();
    const c2 = await newUser();
    await expect(leaveReview(db, c1.id, (await newBooking(c1.id, profile.id)).code, { rating: 5 }, DAY_60)).resolves.toBeDefined();
    await expect(code(leaveReview(db, c2.id, (await newBooking(c2.id, profile.id)).code, { rating: 5 }, DAY_61))).resolves.toBe("too_late");
  });

  it("refuses a second review of the same booking", async () => {
    const c = await newUser();
    const { profile } = await newProvider();
    const b = await newBooking(c.id, profile.id);
    await leaveReview(db, c.id, b.code, { rating: 5 }, NOW);
    await expect(code(leaveReview(db, c.id, b.code, { rating: 4 }, NOW))).resolves.toBe("already_reviewed");
    expect(await profileStats(profile.id)).toEqual({ ratingAvg: 5, ratingCount: 1 });
    expect(await creditBalance(db, c.id, NOW)).toBe(REVIEW_CREDIT);
  });

  it("refuses anyone but the booking's client, and bookings that are not complete", async () => {
    const c = await newUser();
    const other = await newUser();
    const { profile } = await newProvider();
    const done = await newBooking(c.id, profile.id);
    const live = await newBooking(c.id, profile.id, { status: "confirmed" });
    await expect(code(leaveReview(db, other.id, done.code, { rating: 5 }, NOW))).resolves.toBe("forbidden");
    await expect(code(leaveReview(db, c.id, live.code, { rating: 5 }, NOW))).resolves.toBe("wrong_state");
    await expect(code(leaveReview(db, c.id, "SA-0000", { rating: 5 }, NOW))).resolves.toBe("not_found");
  });

  it("rejects a rating outside 1 to 5 and a body over 1000 characters", async () => {
    const c = await newUser();
    const { profile } = await newProvider();
    const b = await newBooking(c.id, profile.id);
    await expect(leaveReview(db, c.id, b.code, { rating: 6 }, NOW)).rejects.toThrow();
    await expect(leaveReview(db, c.id, b.code, { rating: 4.5 }, NOW)).rejects.toThrow();
    await expect(leaveReview(db, c.id, b.code, { rating: 5, body: "x".repeat(1001) }, NOW)).rejects.toThrow(/1000/);
  });
});

describe("reply", () => {
  it("lets the reviewed provider answer once", async () => {
    const c = await newUser();
    const { user: pu, profile } = await newProvider();
    const { user: otherPu } = await newProvider();
    const b = await newBooking(c.id, profile.id);
    const { review } = await leaveReview(db, c.id, b.code, { rating: 4 }, NOW);
    await expect(code(reply(db, otherPu.id, review.id, "Thanks!", NOW))).resolves.toBe("forbidden");
    const replied = await reply(db, pu.id, review.id, " Thank you, it was a pleasure. ", NOW);
    expect(replied.reply).toBe("Thank you, it was a pleasure.");
    expect(replied.replyAt).toEqual(NOW);
    await expect(code(reply(db, pu.id, review.id, "One more thing", NOW))).resolves.toBe("already_replied");
    await expect(reply(db, pu.id, review.id, "x".repeat(601), NOW)).rejects.toThrow(/600/);
  });
});

describe("reviewCrew", () => {
  it("lets the hiring business review a completed job once and credits it Rs 100", async () => {
    const { user: bu, profile: business } = await newProvider("studio");
    const { user: fu, profile: crew } = await newProvider("freelancer");
    const job = await newCrewJob(business.id, crew.id);
    const { review, reward } = await reviewCrew(db, bu.id, job.id, { rating: 5, body: "Solid second shooter." }, NOW);
    expect(review.crewJobId).toBe(job.id);
    expect(review.bookingId).toBeNull();
    expect(review.subjectId).toBe(fu.id);
    expect(reward.credit).toBe("inserted");
    expect(await creditBalance(db, bu.id, NOW)).toBe(REVIEW_CREDIT);
    await expect(code(reviewCrew(db, bu.id, job.id, { rating: 3 }, NOW))).resolves.toBe("already_reviewed");
    expect(await db.select().from(s.reviews).where(eq(s.reviews.crewJobId, job.id))).toHaveLength(1);
  });

  it("refuses anyone but the business and jobs that are not complete", async () => {
    const { user: bu, profile: business } = await newProvider("studio");
    const { user: fu, profile: crew } = await newProvider("freelancer");
    const done = await newCrewJob(business.id, crew.id);
    const live = await newCrewJob(business.id, crew.id, "accepted");
    await expect(code(reviewCrew(db, fu.id, done.id, { rating: 5 }, NOW))).resolves.toBe("forbidden");
    await expect(code(reviewCrew(db, bu.id, live.id, { rating: 5 }, NOW))).resolves.toBe("wrong_state");
  });
});

describe("listReviewsFor", () => {
  it("returns the public shape, newest first, and leaves crew reviews out", async () => {
    const { user: pu, profile } = await newProvider();
    const { profile: crew } = await newProvider("freelancer");
    const sita = await newUser({ name: "Sita Tamang" });
    const anon = await newUser();
    const b1 = await newBooking(sita.id, profile.id, { packageName: "Wedding Classic" });
    const b2 = await newBooking(anon.id, profile.id);
    const { review: r1 } = await leaveReview(db, sita.id, b1.code, { rating: 5, body: "Lovely photos." }, NOW);
    await reply(db, pu.id, r1.id, "Thank you, Sita.", NOW);
    await leaveReview(db, anon.id, b2.code, { rating: 3 }, new Date(NOW.getTime() + 60_000));
    await reviewCrew(db, pu.id, (await newCrewJob(profile.id, crew.id)).id, { rating: 2 }, NOW);

    const list = await listReviewsFor(db, profile.id, { limit: 10 });
    expect(list.map((r) => r.rating)).toEqual([3, 5]);
    expect(list[1]).toMatchObject({
      id: r1.id,
      author: "Sita T.",
      rating: 5,
      body: "Lovely photos.",
      eventMonth: "असोज २०८३",
      packageName: "Wedding Classic",
      reply: "Thank you, Sita.",
      repliedAt: NOW,
    });
    expect(list[0].author).toBe("A client");
    expect(await listReviewsFor(db, profile.id, { limit: 1 })).toHaveLength(1);
  });

  it("shortens author names", () => {
    expect(authorLabel("Sita Tamang")).toBe("Sita T.");
    expect(authorLabel("Ram Bahadur Thapa")).toBe("Ram T.");
    expect(authorLabel("Sita")).toBe("Sita");
    expect(authorLabel(null)).toBe("A client");
  });
});
