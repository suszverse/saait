/**
 * Reviews. A client reviews the business after a completed booking; the
 * business may answer once. A business reviews the crew it hired after a
 * completed crew job. Leaving a review costs nothing and earns the author
 * Rs 100 of credit whatever the rating (rewards/earn.ts), so the one-per-side
 * rule is enforced here before anything is written.
 *
 * The unique index `reviews_one_per_side_uq` only covers booking reviews: a
 * crew review has a null booking_id, and nulls never collide. So both paths
 * lock their parent row FOR UPDATE and check for an existing review inside
 * the same transaction, which serialises two attempts from the same author.
 */
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";
import { BS_MONTHS_NP, daysBetween, toBs, todayInNepal, toNepaliDigits, type IsoDate } from "@/lib/nepali-date";
import * as s from "./db/schema";
import type { Db } from "./providers";
import { onReviewLeft } from "./rewards/earn";

/** A client may review up to this many days after the event (Nepal date). */
export const REVIEW_WINDOW_DAYS = 60;
export const REVIEW_BODY_MAX = 1000;
export const REPLY_BODY_MAX = 600;

export class ReviewError extends Error {
  constructor(
    public readonly code: "not_found" | "forbidden" | "wrong_state" | "too_late" | "already_reviewed" | "already_replied",
    message: string,
  ) {
    super(message);
  }
}

export const reviewInput = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  body: z
    .string()
    .trim()
    .max(REVIEW_BODY_MAX, `Keep your review under ${REVIEW_BODY_MAX} characters.`)
    .optional()
    .transform((v) => (v ? v : null)),
});
export type ReviewInput = z.infer<typeof reviewInput>;

export const replyInput = z.string().trim().min(1, "Write a reply first.").max(REPLY_BODY_MAX, `Keep your reply under ${REPLY_BODY_MAX} characters.`);

/** Recompute the card stats from every booking review of this provider; crew reviews stay out of the public rating. */
async function refreshProviderRating(db: Db, providerProfileId: string, providerUserId: string) {
  const [row] = await db
    .select({ avg: sql<number | null>`round(avg(${s.reviews.rating})::numeric, 1)::float8`, n: sql<number>`count(*)::int` })
    .from(s.reviews)
    .where(and(eq(s.reviews.subjectId, providerUserId), isNotNull(s.reviews.bookingId)));
  await db
    .update(s.providerProfiles)
    .set({ ratingAvg: row?.avg ?? null, ratingCount: row?.n ?? 0 })
    .where(eq(s.providerProfiles.id, providerProfileId));
}

/**
 * The client of a completed booking rates the business, once, within 60 days
 * of the event. Inserts the review, posts the author's credit and refreshes
 * the provider's rating in one transaction.
 */
export async function leaveReview(db: Db, clientUserId: string, bookingCode: string, raw: unknown, now: Date = new Date()) {
  const input = reviewInput.parse(raw);
  return db.transaction(async (tx) => {
    const txDb = tx as unknown as Db;
    const [b] = await tx
      .select({ id: s.bookings.id, clientId: s.bookings.clientId, providerId: s.bookings.providerId, status: s.bookings.status, day: s.bookings.day })
      .from(s.bookings)
      .where(eq(s.bookings.code, bookingCode))
      .for("update");
    if (!b) throw new ReviewError("not_found", "No such booking.");
    if (b.clientId !== clientUserId) throw new ReviewError("forbidden", "Only the client who booked can leave a review.");
    if (b.status !== "completed") throw new ReviewError("wrong_state", "You can review once the booking is complete.");
    if (daysBetween(b.day as IsoDate, todayInNepal(now)) > REVIEW_WINDOW_DAYS)
      throw new ReviewError("too_late", `Reviews close ${REVIEW_WINDOW_DAYS} days after the event.`);

    const [existing] = await tx
      .select({ id: s.reviews.id })
      .from(s.reviews)
      .where(and(eq(s.reviews.bookingId, b.id), eq(s.reviews.authorId, clientUserId)));
    if (existing) throw new ReviewError("already_reviewed", "You have already reviewed this booking.");

    const [provider] = await tx.select({ userId: s.providerProfiles.userId }).from(s.providerProfiles).where(eq(s.providerProfiles.id, b.providerId));
    if (!provider) throw new ReviewError("not_found", "No such provider.");

    const [review] = await tx
      .insert(s.reviews)
      .values({ bookingId: b.id, authorId: clientUserId, subjectId: provider.userId, rating: input.rating, body: input.body, createdAt: now })
      .returning();
    const reward = await onReviewLeft(txDb, review.id, now);
    await refreshProviderRating(txDb, b.providerId, provider.userId);
    return { review, reward };
  });
}

/** The reviewed provider answers a review, once. */
export async function reply(db: Db, providerUserId: string, reviewId: string, rawBody: unknown, now: Date = new Date()) {
  const body = replyInput.parse(rawBody);
  return db.transaction(async (tx) => {
    const [r] = await tx
      .select({ id: s.reviews.id, subjectId: s.reviews.subjectId, reply: s.reviews.reply })
      .from(s.reviews)
      .where(eq(s.reviews.id, reviewId))
      .for("update");
    if (!r) throw new ReviewError("not_found", "No such review.");
    if (r.subjectId !== providerUserId) throw new ReviewError("forbidden", "Only the provider who was reviewed can reply.");
    if (r.reply !== null) throw new ReviewError("already_replied", "You have already replied to this review.");
    const [updated] = await tx.update(s.reviews).set({ reply: body, replyAt: now }).where(eq(s.reviews.id, r.id)).returning();
    return updated;
  });
}

/**
 * The business that hired crew rates the freelancer after a completed job,
 * once per job. The subject is the freelancer's user; the review carries the
 * crew_job_id and no booking_id, so it never shows on a public profile.
 */
export async function reviewCrew(db: Db, businessUserId: string, crewJobId: string, raw: unknown, now: Date = new Date()) {
  const input = reviewInput.parse(raw);
  return db.transaction(async (tx) => {
    const txDb = tx as unknown as Db;
    const [job] = await tx
      .select({ id: s.crewJobs.id, businessId: s.crewJobs.businessId, freelancerId: s.crewJobs.freelancerId, status: s.crewJobs.status })
      .from(s.crewJobs)
      .where(eq(s.crewJobs.id, crewJobId))
      .for("update");
    if (!job) throw new ReviewError("not_found", "No such crew job.");
    const [business] = await tx.select({ userId: s.providerProfiles.userId }).from(s.providerProfiles).where(eq(s.providerProfiles.id, job.businessId));
    if (!business || business.userId !== businessUserId) throw new ReviewError("forbidden", "Only the business that hired this crew can leave a review.");
    if (job.status !== "completed") throw new ReviewError("wrong_state", "You can review once the job is complete.");

    const [existing] = await tx
      .select({ id: s.reviews.id })
      .from(s.reviews)
      .where(and(eq(s.reviews.crewJobId, job.id), eq(s.reviews.authorId, businessUserId)));
    if (existing) throw new ReviewError("already_reviewed", "You have already reviewed this job.");

    const [freelancer] = await tx.select({ userId: s.providerProfiles.userId }).from(s.providerProfiles).where(eq(s.providerProfiles.id, job.freelancerId));
    if (!freelancer) throw new ReviewError("not_found", "No such crew member.");

    const [review] = await tx
      .insert(s.reviews)
      .values({ crewJobId: job.id, authorId: businessUserId, subjectId: freelancer.userId, rating: input.rating, body: input.body, createdAt: now })
      .returning();
    const reward = await onReviewLeft(txDb, review.id, now);
    return { review, reward };
  });
}

export type PublicReview = {
  id: string;
  /** "Sita T." — first name and the initial of the last. */
  author: string;
  rating: number;
  body: string | null;
  /** Month of the event in Nepali, "फागुन २०८३". */
  eventMonth: string;
  packageName: string | null;
  reply: string | null;
  repliedAt: Date | null;
  createdAt: Date;
};

/** "Sita Tamang" → "Sita T."; a client with no name on file reads as "A client". */
export function authorLabel(name: string | null): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "A client";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

function eventMonthNp(iso: IsoDate): string {
  const b = toBs(iso);
  return `${BS_MONTHS_NP[b.month - 1]} ${toNepaliDigits(b.year)}`;
}

/** Booking reviews of a provider for its public profile, newest first. */
export async function listReviewsFor(db: Db, providerProfileId: string, opts: { limit?: number } = {}): Promise<PublicReview[]> {
  const limit = Math.min(Math.max(opts.limit ?? 10, 1), 50);
  const rows = await db
    .select({
      id: s.reviews.id,
      authorName: s.users.name,
      rating: s.reviews.rating,
      body: s.reviews.body,
      day: s.bookings.day,
      packageName: s.bookings.packageName,
      reply: s.reviews.reply,
      repliedAt: s.reviews.replyAt,
      createdAt: s.reviews.createdAt,
    })
    .from(s.reviews)
    .innerJoin(s.bookings, eq(s.bookings.id, s.reviews.bookingId))
    .innerJoin(s.users, eq(s.users.id, s.reviews.authorId))
    .where(eq(s.bookings.providerId, providerProfileId))
    .orderBy(desc(s.reviews.createdAt))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    author: authorLabel(r.authorName),
    rating: r.rating,
    body: r.body,
    eventMonth: eventMonthNp(r.day as IsoDate),
    packageName: r.packageName ?? null,
    reply: r.reply,
    repliedAt: r.repliedAt,
    createdAt: r.createdAt,
  }));
}
