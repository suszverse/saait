import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { rupees } from "@/lib/money";
import * as s from "../db/schema";
import { creditBalance, levelsFor, lifetimePoints, pointsBalance, post, RewardError } from "./ledger";

const client = postgres(process.env.DATABASE_URL_TEST ?? "", { max: 1, onnotice: () => {} });
const db = drizzle(client, { schema: s, casing: "snake_case" });

const NOW = new Date("2026-11-09T06:00:00Z");
const monthsAgo = (n: number) => new Date(Date.UTC(2026, 10 - n, 9, 6));
const uuid = () => crypto.randomUUID();

let seq = 0;
async function newUser(over: Partial<typeof s.users.$inferInsert> = {}) {
  const [u] = await db
    .insert(s.users)
    .values({ phone: `+97798${String(50_000_000 + ++seq)}`, role: "provider", ...over })
    .returning();
  return u;
}

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

/** A referral row pointing at `referrerId`; the referee is a throwaway user. */
async function fakeReferral(referrerId: string) {
  const referee = await newUser({ role: "client" });
  const [r] = await db.insert(s.referrals).values({ referrerId, refereeId: referee.id }).returning();
  return r.id;
}

beforeAll(truncate);
afterAll(async () => {
  await client.end();
});

describe("post", () => {
  it("rejects a zero amount, a bad uuid and an unknown reason before touching the database", async () => {
    const u = await newUser();
    await expect(post(db, { userId: u.id, kind: "points", amount: 0, reason: "on_time" })).rejects.toThrow();
    await expect(post(db, { userId: "nope", kind: "points", amount: 10, reason: "on_time" })).rejects.toThrow();
    await expect(post(db, { userId: u.id, kind: "points", amount: 10, reason: "bonus" })).rejects.toThrow();
    await expect(post(db, { userId: u.id, kind: "points", amount: 1.5, reason: "on_time" })).rejects.toThrow();
  });

  it("writes an earning once per source row and reports the repeat", async () => {
    const u = await newUser();
    const referralId = await fakeReferral(u.id);
    expect(await post(db, { userId: u.id, kind: "points", amount: 50, reason: "crew_job_completed", referralId }, NOW)).toEqual({ inserted: true });
    expect(await post(db, { userId: u.id, kind: "points", amount: 50, reason: "crew_job_completed", referralId }, NOW)).toEqual({ inserted: false });
    const rows = await db.select().from(s.rewardLedger).where(eq(s.rewardLedger.userId, u.id));
    expect(rows).toHaveLength(1);
    expect(await pointsBalance(db, u.id)).toBe(50);
  });

  it("lets recurring reasons repeat", async () => {
    const u = await newUser();
    for (let i = 0; i < 3; i++) expect(await post(db, { userId: u.id, kind: "points", amount: -10, reason: "plan_month" }, NOW)).toEqual({ inserted: true });
    expect(await pointsBalance(db, u.id)).toBe(-30);
  });

  it("stamps a credit grant with a twelve-month expiry unless one is given", async () => {
    const u = await newUser();
    await post(db, { userId: u.id, kind: "credit", amount: rupees(100), reason: "referral", referralId: await fakeReferral(u.id) }, NOW);
    const [grant] = await db.select().from(s.rewardLedger).where(eq(s.rewardLedger.userId, u.id));
    expect(grant.expiresAt?.toISOString()).toBe("2027-11-09T06:00:00.000Z");
    const explicit = new Date("2027-01-01T00:00:00Z");
    await post(db, { userId: u.id, kind: "credit", amount: rupees(50), reason: "review_left", referralId: await fakeReferral(u.id), expiresAt: explicit }, NOW);
    const rows = await db.select().from(s.rewardLedger).where(eq(s.rewardLedger.userId, u.id));
    expect(rows.map((r) => r.expiresAt?.toISOString()).sort()).toEqual(["2027-01-01T00:00:00.000Z", "2027-11-09T06:00:00.000Z"]);
  });

  it("refuses points while frozen, except no_show and reset", async () => {
    const u = await newUser({ pointsFrozenUntil: new Date(NOW.getTime() + 86_400_000) });
    await expect(post(db, { userId: u.id, kind: "points", amount: 20, reason: "on_time", referralId: await fakeReferral(u.id) }, NOW)).rejects.toMatchObject({ code: "points_frozen" });
    await expect(post(db, { userId: u.id, kind: "points", amount: -10, reason: "plan_month" }, NOW)).rejects.toBeInstanceOf(RewardError);
    expect(await post(db, { userId: u.id, kind: "points", amount: -100, reason: "no_show", referralId: await fakeReferral(u.id) }, NOW)).toEqual({ inserted: true });
    expect(await post(db, { userId: u.id, kind: "points", amount: -200, reason: "reset" }, NOW)).toEqual({ inserted: true });
    // Credit is not frozen.
    expect(await post(db, { userId: u.id, kind: "credit", amount: rupees(10), reason: "referral", referralId: await fakeReferral(u.id) }, NOW)).toEqual({ inserted: true });
    expect(await pointsBalance(db, u.id)).toBe(-300);
    // Once the freeze lapses the same earning goes through.
    expect(await post(db, { userId: u.id, kind: "points", amount: 20, reason: "on_time", referralId: await fakeReferral(u.id) }, new Date(NOW.getTime() + 2 * 86_400_000))).toEqual({ inserted: true });
  });

  it("rejects an unknown user", async () => {
    await expect(post(db, { userId: uuid(), kind: "points", amount: 10, reason: "reset" })).rejects.toMatchObject({ code: "unknown_user" });
  });
});

describe("creditBalance", () => {
  it("is zero with no rows and never negative", async () => {
    const u = await newUser();
    expect(await creditBalance(db, u.id, NOW)).toBe(0);
    await post(db, { userId: u.id, kind: "credit", amount: -rupees(500), reason: "checkout_spend" }, NOW);
    expect(await creditBalance(db, u.id, NOW)).toBe(0);
  });

  it("spends the oldest grant first and drops what a lapsed grant had left", async () => {
    const u = await newUser();
    // Rs 300 earned eleven months ago, Rs 200 earned last month, Rs 100 spent a week ago.
    await post(db, { userId: u.id, kind: "credit", amount: rupees(300), reason: "referral", referralId: await fakeReferral(u.id) }, monthsAgo(11));
    await post(db, { userId: u.id, kind: "credit", amount: rupees(200), reason: "review_left", referralId: await fakeReferral(u.id) }, monthsAgo(1));
    await post(db, { userId: u.id, kind: "credit", amount: -rupees(100), reason: "checkout_spend" }, new Date(NOW.getTime() - 7 * 86_400_000));
    expect(await creditBalance(db, u.id, NOW)).toBe(rupees(400));
    // Two months on, the older grant has expired with Rs 200 unspent; only the newer Rs 200 remains.
    expect(await creditBalance(db, u.id, new Date(Date.UTC(2027, 0, 9, 6)))).toBe(rupees(200));
  });

  it("cannot spend a thirteen-month-old grant", async () => {
    const u = await newUser();
    await post(db, { userId: u.id, kind: "credit", amount: rupees(1000), reason: "referral", referralId: await fakeReferral(u.id) }, monthsAgo(13));
    expect(await creditBalance(db, u.id, NOW)).toBe(0);
    // A spend today finds no live bucket, and the fresh grant after it is untouched.
    await post(db, { userId: u.id, kind: "credit", amount: -rupees(100), reason: "checkout_spend" }, NOW);
    await post(db, { userId: u.id, kind: "credit", amount: rupees(50), reason: "review_left", referralId: await fakeReferral(u.id) }, new Date(NOW.getTime() + 1000));
    expect(await creditBalance(db, u.id, new Date(NOW.getTime() + 2000))).toBe(rupees(50));
  });

  it("does not count an expiry row twice", async () => {
    const u = await newUser();
    await post(db, { userId: u.id, kind: "credit", amount: rupees(100), reason: "referral", referralId: await fakeReferral(u.id) }, monthsAgo(13));
    await post(db, { userId: u.id, kind: "credit", amount: -rupees(100), reason: "expiry" }, monthsAgo(1));
    await post(db, { userId: u.id, kind: "credit", amount: rupees(80), reason: "review_left", referralId: await fakeReferral(u.id) }, NOW);
    expect(await creditBalance(db, u.id, NOW)).toBe(rupees(80));
  });
});

describe("points and levels", () => {
  it("spending plan months lowers the balance but not the level", async () => {
    const u = await newUser();
    await post(db, { userId: u.id, kind: "points", amount: 1200, reason: "urgent_completed", referralId: await fakeReferral(u.id) }, NOW);
    await post(db, { userId: u.id, kind: "points", amount: -1000, reason: "plan_month" }, NOW);
    expect(await pointsBalance(db, u.id)).toBe(200);
    expect(await lifetimePoints(db, u.id)).toBe(1200);
    expect((await levelsFor(db, [u.id])).get(u.id)).toBe("Proven");
  });

  it("penalties do lower the level", async () => {
    const u = await newUser();
    await post(db, { userId: u.id, kind: "points", amount: 350, reason: "crew_job_completed", referralId: await fakeReferral(u.id) }, NOW);
    expect((await levelsFor(db, [u.id])).get(u.id)).toBe("Trusted");
    await post(db, { userId: u.id, kind: "points", amount: -100, reason: "no_show", referralId: await fakeReferral(u.id) }, NOW);
    expect(await lifetimePoints(db, u.id)).toBe(250);
    expect((await levelsFor(db, [u.id])).get(u.id)).toBe("New");
  });

  it("levelsFor covers every id asked for, in bulk", async () => {
    const a = await newUser();
    const b = await newUser();
    const c = await newUser();
    await post(db, { userId: a.id, kind: "points", amount: 2500, reason: "report_confirmed", referralId: await fakeReferral(a.id) }, NOW);
    await post(db, { userId: b.id, kind: "credit", amount: rupees(10), reason: "referral", referralId: await fakeReferral(b.id) }, NOW);
    const levels = await levelsFor(db, [a.id, b.id, c.id]);
    expect(levels.get(a.id)).toBe("Top");
    expect(levels.get(b.id)).toBe("New");
    expect(levels.get(c.id)).toBe("New");
    expect(await levelsFor(db, [])).toEqual(new Map());
  });
});
