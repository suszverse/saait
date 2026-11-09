import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as s from "../db/schema";
import { seed } from "../db/seed";
import { pointsBalance, post, RewardError } from "./ledger";
import { RedeemError, redeemPlanMonth } from "./redeem";

// Two connections so the concurrency test runs two transactions at once rather than queueing on one socket.
const client = postgres(process.env.DATABASE_URL_TEST ?? "", { max: 2, onnotice: () => {} });
const db = drizzle(client, { schema: s, casing: "snake_case" });

// 06:00Z is 11:45 in Nepal, so "today" is 2026-11-09 on both sides of the line.
const NOW = new Date("2026-11-09T06:00:00Z");

/** Another agent may reset the shared test database mid-run; wait for the tables to come back. */
async function reset() {
  for (let attempt = 0; ; attempt++) {
    try {
      await client`truncate table users, cities, service_categories, auspicious_dates restart identity cascade`;
      await seed(db);
      return;
    } catch (e) {
      if (attempt >= 20 || !/does not exist/.test(String(e))) throw e;
      await new Promise((r) => setTimeout(r, 500));
    }
  }
}

async function profile(slug: string) {
  const [p] = await db.select().from(s.providerProfiles).where(eq(s.providerProfiles.slug, slug));
  return p;
}

/** One earning row; the reason has no source id, so each user gets it once, which is all a test needs. */
async function givePoints(userId: string, amount: number) {
  expect(await post(db, { userId, kind: "points", amount, reason: "on_time" }, NOW)).toEqual({ inserted: true });
}

beforeAll(reset);
afterAll(async () => {
  await client.end();
});

describe("redeemPlanMonth", () => {
  it("spends 1,500 points on a Business month and leaves a Studio plan alone", async () => {
    const before = await profile("shrestha-studio");
    await db.update(s.providerProfiles).set({ plan: "studio" }).where(eq(s.providerProfiles.id, before.id));
    await givePoints(before.userId, 1_600);

    const out = await redeemPlanMonth(db, before.id, NOW);
    expect(out).toEqual({ periodStart: "2026-11-09", periodEnd: "2026-12-08", pointsLeft: 100 });

    const subs = await db.select().from(s.subscriptions).where(eq(s.subscriptions.providerId, before.id));
    expect(subs).toHaveLength(1);
    expect(subs[0]).toMatchObject({ plan: "pro", price: 0, currency: "NPR", periodStart: "2026-11-09", periodEnd: "2026-12-08" });
    expect(await pointsBalance(db, before.userId)).toBe(100);
    expect((await profile("shrestha-studio")).plan).toBe("studio");
  });

  it("lifts a free-plan studio to Business", async () => {
    const before = await profile("siddhartha-photo");
    expect(before.plan).toBe("free");
    await givePoints(before.userId, 2_000);
    const out = await redeemPlanMonth(db, before.id, NOW);
    expect(out.pointsLeft).toBe(500);
    expect((await profile("siddhartha-photo")).plan).toBe("pro");
  });

  it("refuses a freelancer, however many points they hold", async () => {
    const crew = await profile("kiran-rai");
    await givePoints(crew.userId, 5_000);
    await expect(redeemPlanMonth(db, crew.id, NOW)).rejects.toMatchObject({ code: "not_a_business" } satisfies Partial<RedeemError>);
    expect(await db.select().from(s.subscriptions).where(eq(s.subscriptions.providerId, crew.id))).toHaveLength(0);
    expect(await pointsBalance(db, crew.userId)).toBe(5_000);
  });

  it("refuses 1,000 points and writes nothing", async () => {
    const p = await profile("prakash-films");
    await givePoints(p.userId, 1_000);
    await expect(redeemPlanMonth(db, p.id, NOW)).rejects.toMatchObject({ code: "insufficient_points" } satisfies Partial<RedeemError>);
    expect(await db.select().from(s.subscriptions).where(eq(s.subscriptions.providerId, p.id))).toHaveLength(0);
    expect(await pointsBalance(db, p.userId)).toBe(1_000);
  });

  it("lets a points freeze through untouched and writes nothing", async () => {
    const p = await profile("mandap-moments");
    await givePoints(p.userId, 3_000);
    await db.update(s.users).set({ pointsFrozenUntil: new Date("2026-12-01T00:00:00Z") }).where(eq(s.users.id, p.userId));
    await expect(redeemPlanMonth(db, p.id, NOW)).rejects.toMatchObject({ code: "points_frozen" } satisfies Partial<RewardError>);
    expect(await db.select().from(s.subscriptions).where(eq(s.subscriptions.providerId, p.id))).toHaveLength(0);
    expect(await pointsBalance(db, p.userId)).toBe(3_000);
  });

  it("lets exactly one of two simultaneous redemptions through on 1,500 points", async () => {
    const p = await profile("anita-gurung-photography");
    await givePoints(p.userId, 1_500);
    const results = await Promise.allSettled([redeemPlanMonth(db, p.id, NOW), redeemPlanMonth(db, p.id, NOW)]);
    const won = results.filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof redeemPlanMonth>>> => r.status === "fulfilled");
    const lost = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(1);
    expect(lost[0].reason).toMatchObject({ code: "insufficient_points" } satisfies Partial<RedeemError>);
    expect(won[0].value).toMatchObject({ periodStart: "2026-11-09", periodEnd: "2026-12-08", pointsLeft: 0 });
    expect(await pointsBalance(db, p.userId)).toBe(0);
    expect(await db.select().from(s.subscriptions).where(eq(s.subscriptions.providerId, p.id))).toHaveLength(1);
  });

  it("chains a second month onto the end of the first, back to back without overlap", async () => {
    const p = await profile("himal-captures");
    await givePoints(p.userId, 3_000);
    const first = await redeemPlanMonth(db, p.id, NOW);
    const second = await redeemPlanMonth(db, p.id, NOW);
    expect(first).toMatchObject({ periodStart: "2026-11-09", periodEnd: "2026-12-08", pointsLeft: 1_500 });
    expect(second).toMatchObject({ periodStart: "2026-12-09", periodEnd: "2027-01-08", pointsLeft: 0 });
    const subs = await db.select().from(s.subscriptions).where(eq(s.subscriptions.providerId, p.id)).orderBy(s.subscriptions.periodStart);
    expect(subs.map((r) => [r.periodStart, r.periodEnd])).toEqual([
      ["2026-11-09", "2026-12-08"],
      ["2026-12-09", "2027-01-08"],
    ]);
    await expect(redeemPlanMonth(db, p.id, NOW)).rejects.toMatchObject({ code: "insufficient_points" });
  });
});
