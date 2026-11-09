/**
 * Reward earn events (proposal section 7). Each function turns one thing
 * that happened in the product into ledger rows: a completed booking, a
 * review, a confirmed report, a no-show, a finished crew job. The ledger's
 * once-per-source index makes every event safe to replay, so callers may
 * fire these from a retry or a backfill without double-crediting.
 *
 * Points earnings for a frozen user are refused by the ledger. Here that
 * refusal is reported as `"frozen"` rather than thrown, so a frozen provider
 * never blocks the client's credit or the completion that triggered it; a
 * no-show penalty is allowed through regardless.
 */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { mulRatio, rupees, sub, type Paisa } from "@/lib/money";
import * as s from "../db/schema";
import type { Db } from "../providers";
import { type LedgerEntry, post, RewardError } from "./ledger";

/** Client credit on completion: a quarter of the fee actually paid (fee less credit applied). */
export const BOOKING_CREDIT_PERCENT = 25;
export const BOOKING_POINTS = 100;
export const REFERRAL_CREDIT = rupees(300);
export const REVIEW_CREDIT = rupees(100);
export const FIVE_STAR_POINTS = 20;
export const REPORT_CREDIT = rupees(200);
export const NO_SHOW_POINTS = 200;
export const CREW_JOB_POINTS = 100;

export class EarnError extends Error {
  constructor(
    public readonly code: "not_found",
    message: string,
  ) {
    super(message);
  }
}

/** What one ledger post did: a new row, a replay that found its row already there, a frozen refusal, or nothing to write. */
export type Outcome = "inserted" | "repeat" | "frozen" | "skipped";

function outcome(r: { inserted: boolean }): Outcome {
  return r.inserted ? "inserted" : "repeat";
}

/** Points post that reports a freeze instead of throwing; everything else propagates. */
async function postPoints(db: Db, entry: LedgerEntry, now: Date): Promise<Outcome> {
  try {
    return outcome(await post(db, entry, now));
  } catch (e) {
    if (e instanceof RewardError && e.code === "points_frozen") return "frozen";
    throw e;
  }
}

async function providerUserId(db: Db, providerProfileId: string): Promise<string> {
  const [p] = await db.select({ userId: s.providerProfiles.userId }).from(s.providerProfiles).where(eq(s.providerProfiles.id, providerProfileId));
  if (!p) throw new EarnError("not_found", "No such provider.");
  return p.userId;
}

/**
 * Booking completed: the client earns 25% of the fee they paid as credit,
 * the provider earns 100 points, and if the client was referred and this is
 * their first completed booking, both sides of the referral earn Rs 300.
 * A fee fully covered by credit earns no credit (the ledger refuses zero).
 */
export async function onBookingCompleted(db: Db, bookingId: string, now: Date = new Date()) {
  const [b] = await db
    .select({ clientId: s.bookings.clientId, providerId: s.bookings.providerId, bookingFee: s.bookings.bookingFee, creditApplied: s.bookings.creditApplied })
    .from(s.bookings)
    .where(eq(s.bookings.id, bookingId));
  if (!b) throw new EarnError("not_found", "No such booking.");

  const feePaid = sub(b.bookingFee as Paisa, b.creditApplied as Paisa);
  const clientCredit = mulRatio(feePaid, BOOKING_CREDIT_PERCENT, 100);
  const credit: Outcome =
    clientCredit > 0 ? outcome(await post(db, { userId: b.clientId, kind: "credit", amount: clientCredit, reason: "booking_completed", bookingId }, now)) : "skipped";

  const providerPoints = await postPoints(db, { userId: await providerUserId(db, b.providerId), kind: "points", amount: BOOKING_POINTS, reason: "booking_completed", bookingId }, now);

  let referral: Outcome = "skipped";
  const [ref] = await db.select({ id: s.referrals.id, referrerId: s.referrals.referrerId }).from(s.referrals).where(eq(s.referrals.refereeId, b.clientId));
  if (ref) {
    // Paid once per referral for life: the ledger's unique index on
    // (user, kind, reason, referral_id) makes a second completion a no-op,
    // so no "is this the first booking" check is needed and a retry or a
    // backfill that runs after later bookings cannot lose the bonus.
    const referee = await post(db, { userId: b.clientId, kind: "credit", amount: REFERRAL_CREDIT, reason: "referral", referralId: ref.id }, now);
    const referrer = await post(db, { userId: ref.referrerId, kind: "credit", amount: REFERRAL_CREDIT, reason: "referral", referralId: ref.id }, now);
    referral = referee.inserted || referrer.inserted ? "inserted" : "repeat";
  }
  return { clientCredit, credit, providerPoints, referral };
}

/**
 * Review left: Rs 100 credit to the author whatever the rating, and 20 points
 * to the subject when it is five stars and the subject is a provider (a
 * business rating its client five stars moves no points; clients have none).
 */
export async function onReviewLeft(db: Db, reviewId: string, now: Date = new Date()) {
  const [r] = await db.select({ authorId: s.reviews.authorId, subjectId: s.reviews.subjectId, rating: s.reviews.rating }).from(s.reviews).where(eq(s.reviews.id, reviewId));
  if (!r) throw new EarnError("not_found", "No such review.");
  const credit = outcome(await post(db, { userId: r.authorId, kind: "credit", amount: REVIEW_CREDIT, reason: "review_left", reviewId }, now));
  let fiveStar: Outcome = "skipped";
  if (r.rating === 5) {
    const [subjectProvider] = await db.select({ id: s.providerProfiles.id }).from(s.providerProfiles).where(eq(s.providerProfiles.userId, r.subjectId));
    if (subjectProvider) fiveStar = await postPoints(db, { userId: r.subjectId, kind: "points", amount: FIVE_STAR_POINTS, reason: "five_star", reviewId }, now);
  }
  return { credit, fiveStar };
}

/** Report confirmed by an operator: Rs 200 credit to whoever reported it. */
export async function onReportConfirmed(db: Db, reportId: string, now: Date = new Date()) {
  const [r] = await db.select({ reporterId: s.reports.reporterId }).from(s.reports).where(eq(s.reports.id, reportId));
  if (!r) throw new EarnError("not_found", "No such report.");
  return { credit: outcome(await post(db, { userId: r.reporterId, kind: "credit", amount: REPORT_CREDIT, reason: "report_confirmed", reportId }, now)) };
}

export const noShowInput = z
  .object({
    providerUserId: z.string().uuid(),
    bookingId: z.string().uuid().optional(),
    crewJobId: z.string().uuid().optional(),
  })
  .refine((v) => [v.bookingId, v.crewJobId].filter(Boolean).length === 1, "A no-show is against exactly one booking or crew job.");
export type NoShowInput = z.infer<typeof noShowInput>;

/** No-show: 200 points off the provider who did not turn up. The ledger lets this through while frozen. */
export async function onNoShow(db: Db, raw: unknown, now: Date = new Date()) {
  const input = noShowInput.parse(raw);
  return {
    points: outcome(
      await post(db, { userId: input.providerUserId, kind: "points", amount: -NO_SHOW_POINTS, reason: "no_show", bookingId: input.bookingId, crewJobId: input.crewJobId }, now),
    ),
  };
}

/** Crew job completed: 100 points to the business's user and 100 to the freelancer's. */
export async function onCrewJobCompleted(db: Db, crewJobId: string, now: Date = new Date()) {
  const [j] = await db.select({ businessId: s.crewJobs.businessId, freelancerId: s.crewJobs.freelancerId }).from(s.crewJobs).where(eq(s.crewJobs.id, crewJobId));
  if (!j) throw new EarnError("not_found", "No such crew job.");
  const business = await postPoints(db, { userId: await providerUserId(db, j.businessId), kind: "points", amount: CREW_JOB_POINTS, reason: "crew_job_completed", crewJobId }, now);
  const freelancer = await postPoints(db, { userId: await providerUserId(db, j.freelancerId), kind: "points", amount: CREW_JOB_POINTS, reason: "crew_job_completed", crewJobId }, now);
  return { business, freelancer };
}
