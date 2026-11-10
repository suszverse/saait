/**
 * Reward ledger: the only writer and reader of `reward_ledger`.
 *
 * The table is append-only (migration 0005 rejects UPDATE and DELETE), so a
 * balance is always a sum over rows and a correction is a new row with the
 * opposite sign. Credit is paisa off a booking fee and expires twelve months
 * after it was earned; points are reputation, read as a level, and can be
 * frozen per user while a report is open.
 */
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { levelFor, type LevelName } from "@/lib/levels";
import { paisa, type Paisa } from "@/lib/money";
import * as s from "../db/schema";
import type { Db } from "../providers";

export const CREDIT_TTL_MONTHS = 12;

/** Reasons that recur for one user, so the once-per-source unique index skips them. */
export const RECURRING_REASONS = ["checkout_spend", "expiry", "plan_month"] as const satisfies readonly (typeof s.rewardReasonEnum.enumValues)[number][];
/** Points rows a frozen user may still receive: penalties and the reset that ends the freeze. */
export const ALLOWED_WHILE_FROZEN = ["no_show", "reset"] as const satisfies readonly (typeof s.rewardReasonEnum.enumValues)[number][];

export class RewardError extends Error {
  constructor(
    public readonly code: "points_frozen" | "unknown_user",
    message: string,
  ) {
    super(message);
  }
}

export const ledgerEntry = z.object({
  userId: z.string().uuid(),
  kind: z.enum(s.rewardKindEnum.enumValues),
  amount: z
    .number()
    .int()
    .refine((n) => n !== 0, "A ledger row must move the balance."),
  reason: z.enum(s.rewardReasonEnum.enumValues),
  bookingId: z.string().uuid().optional(),
  reviewId: z.string().uuid().optional(),
  crewJobId: z.string().uuid().optional(),
  reportId: z.string().uuid().optional(),
  referralId: z.string().uuid().optional(),
  expiresAt: z.date().optional(),
});
export type LedgerEntry = z.infer<typeof ledgerEntry>;

function addMonths(from: Date, months: number): Date {
  const d = new Date(from);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

/**
 * Appends one row. Earning reasons are written once per source row: a second
 * post for the same booking, review, job, report or referral inserts nothing
 * and reports `inserted: false`. Points cannot be earned or spent while the
 * user is frozen, except a no-show penalty or the reset that closes the
 * freeze. Credit grants without an expiry get one twelve months out.
 */
export async function post(db: Db, raw: unknown, now: Date = new Date()): Promise<{ inserted: boolean }> {
  const entry = ledgerEntry.parse(raw);
  const [user] = await db.select({ pointsFrozenUntil: s.users.pointsFrozenUntil }).from(s.users).where(eq(s.users.id, entry.userId));
  if (!user) throw new RewardError("unknown_user", "No such user.");
  const frozen = user.pointsFrozenUntil !== null && user.pointsFrozenUntil > now;
  if (entry.kind === "points" && frozen && !(ALLOWED_WHILE_FROZEN as readonly string[]).includes(entry.reason)) {
    throw new RewardError("points_frozen", "Points are frozen for this user until a report is resolved.");
  }
  const expiresAt = entry.kind === "credit" && entry.amount > 0 ? (entry.expiresAt ?? addMonths(now, CREDIT_TTL_MONTHS)) : (entry.expiresAt ?? null);
  const rows = await db
    .insert(s.rewardLedger)
    .values({
      userId: entry.userId,
      kind: entry.kind,
      amount: entry.amount,
      reason: entry.reason,
      bookingId: entry.bookingId,
      reviewId: entry.reviewId,
      crewJobId: entry.crewJobId,
      reportId: entry.reportId,
      referralId: entry.referralId,
      expiresAt,
      createdAt: now,
    })
    // Recurring reasons are outside the partial unique index, so for them this never fires.
    .onConflictDoNothing()
    .returning({ id: s.rewardLedger.id });
  return { inserted: rows.length === 1 };
}

/**
 * Spendable credit at `now`, in paisa.
 *
 * Algorithm: replay the user's credit rows oldest first. A grant (positive)
 * opens a bucket with its expiry. A spend (negative checkout_spend) drains
 * the oldest buckets that were still unexpired at the moment of the spend,
 * first in, first out. The balance is what remains in buckets unexpired at
 * `now`; whatever was left in a bucket that has since expired is gone.
 * `expiry` rows are bookkeeping written when a bucket lapses and are already
 * implied by `expires_at`, so they are not counted again here. Never below zero.
 */
export async function creditBalance(db: Db, userId: string, now: Date = new Date()): Promise<Paisa> {
  const rows = await db
    .select({ amount: s.rewardLedger.amount, reason: s.rewardLedger.reason, expiresAt: s.rewardLedger.expiresAt, createdAt: s.rewardLedger.createdAt })
    .from(s.rewardLedger)
    .where(and(eq(s.rewardLedger.userId, userId), eq(s.rewardLedger.kind, "credit"), ne(s.rewardLedger.reason, "expiry")))
    .orderBy(s.rewardLedger.createdAt, sql`case when ${s.rewardLedger.amount} > 0 then 0 else 1 end`, s.rewardLedger.id);
  const buckets: { left: number; expiresAt: Date | null }[] = [];
  for (const row of rows) {
    if (row.amount > 0) {
      buckets.push({ left: row.amount, expiresAt: row.expiresAt });
      continue;
    }
    let toSpend = -row.amount;
    for (const b of buckets) {
      if (toSpend === 0) break;
      if (b.left === 0 || (b.expiresAt !== null && b.expiresAt <= row.createdAt)) continue;
      const take = Math.min(b.left, toSpend);
      b.left -= take;
      toSpend -= take;
    }
  }
  const total = buckets.filter((b) => b.expiresAt === null || b.expiresAt > now).reduce((sum, b) => sum + b.left, 0);
  return paisa(Math.max(0, total));
}

async function sumPoints(db: Db, userId: string, excludePlanMonth: boolean): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${s.rewardLedger.amount}), 0)::bigint` })
    .from(s.rewardLedger)
    .where(
      and(
        eq(s.rewardLedger.userId, userId),
        eq(s.rewardLedger.kind, "points"),
        excludePlanMonth ? ne(s.rewardLedger.reason, "plan_month") : undefined,
      ),
    );
  return Number(row?.total ?? 0);
}

/** Points available to spend on a plan month: every points row, spends included. */
export function pointsBalance(db: Db, userId: string): Promise<number> {
  return sumPoints(db, userId, false);
}

/** Points that set the level: earnings and penalties, but not plan-month spends. */
export function lifetimePoints(db: Db, userId: string): Promise<number> {
  return sumPoints(db, userId, true);
}

/** Level name for each user id in one query; users with no rows are New. */
export async function levelsFor(db: Db, userIds: string[]): Promise<Map<string, LevelName>> {
  const levels = new Map<string, LevelName>(userIds.map((id) => [id, levelFor(0)]));
  if (userIds.length === 0) return levels;
  const rows = await db
    .select({ userId: s.rewardLedger.userId, total: sql<number>`sum(${s.rewardLedger.amount})::bigint` })
    .from(s.rewardLedger)
    .where(and(inArray(s.rewardLedger.userId, userIds), eq(s.rewardLedger.kind, "points"), ne(s.rewardLedger.reason, "plan_month")))
    .groupBy(s.rewardLedger.userId);
  for (const r of rows) levels.set(r.userId, levelFor(Number(r.total)));
  return levels;
}
