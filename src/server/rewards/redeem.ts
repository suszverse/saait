/**
 * Spend points on a plan month. A business trades PLAN_MONTH_POINTS for one
 * month of Business at price 0: the spend and the subscription row land in
 * one transaction so neither exists without the other. A studio that is
 * already on the Studio plan keeps it; the free month only lifts `free` to
 * `pro`.
 */
import { desc, eq } from "drizzle-orm";
import { addDays, todayInNepal, type IsoDate } from "@/lib/nepali-date";
import { PLAN_MONTH_POINTS } from "@/lib/plans";
import * as s from "../db/schema";
import type { Db } from "../providers";
import { pointsBalance, post } from "./ledger";

export class RedeemError extends Error {
  constructor(
    public readonly code: "not_found" | "not_a_business" | "insufficient_points",
    message: string,
  ) {
    super(message);
  }
}

/** Same day of the next month, clamped to that month's last day (31 Jan → 28 Feb). */
function addOneMonth(iso: IsoDate): IsoDate {
  const [y, m, d] = iso.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(d, lastDay))).toISOString().slice(0, 10);
}

/**
 * The month starts the day after the provider's latest period ends, so a
 * month bought early extends the subscription instead of overlapping it, or
 * today when there is none. Periods are inclusive on both ends.
 *
 * Everything runs inside one transaction that first locks the provider row,
 * so two redemptions at once run one after the other: the second sees the
 * first's spend and either chains onto its period or fails on points. Locking
 * the subscription row alone would not do; a first month has none to lock.
 */
export async function redeemPlanMonth(db: Db, providerProfileId: string, now: Date = new Date()): Promise<{ periodStart: IsoDate; periodEnd: IsoDate; pointsLeft: number }> {
  return db.transaction(async (tx) => {
    const txDb = tx as unknown as Db;
    const [profile] = await tx
      .select({ id: s.providerProfiles.id, userId: s.providerProfiles.userId, kind: s.providerProfiles.kind, plan: s.providerProfiles.plan })
      .from(s.providerProfiles)
      .where(eq(s.providerProfiles.id, providerProfileId))
      .for("update");
    if (!profile) throw new RedeemError("not_found", "No such provider.");
    if (profile.kind !== "studio") throw new RedeemError("not_a_business", "Only a business can spend points on a plan month.");
    const balance = await pointsBalance(txDb, profile.userId);
    if (balance < PLAN_MONTH_POINTS) throw new RedeemError("insufficient_points", `A plan month costs ${PLAN_MONTH_POINTS} points; you have ${balance}.`);

    const [latest] = await tx
      .select({ periodEnd: s.subscriptions.periodEnd })
      .from(s.subscriptions)
      .where(eq(s.subscriptions.providerId, profile.id))
      .orderBy(desc(s.subscriptions.periodEnd))
      .limit(1);
    const periodStart = latest ? addDays(latest.periodEnd, 1) : todayInNepal(now);
    const periodEnd = addDays(addOneMonth(periodStart), -1);
    // Throws RewardError('points_frozen') while a report is open; nothing is written.
    await post(txDb, { userId: profile.userId, kind: "points", amount: -PLAN_MONTH_POINTS, reason: "plan_month" }, now);
    await tx.insert(s.subscriptions).values({ providerId: profile.id, plan: "pro", price: 0, periodStart, periodEnd, createdAt: now });
    if (profile.plan === "free") await tx.update(s.providerProfiles).set({ plan: "pro" }).where(eq(s.providerProfiles.id, profile.id));
    return { periodStart, periodEnd, pointsLeft: await pointsBalance(txDb, profile.userId) };
  });
}
