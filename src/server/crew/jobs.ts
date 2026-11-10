/**
 * Crew jobs: a studio hires a verified freelancer for one day at a day rate
 * (docs/proposals/leakage-and-rewards.md section 13). Freelancers stay
 * anonymous to the studio until they accept: search and lists carry the crew
 * alias, headline, roles, level and reliability, never a name or phone. The
 * name and phone unlock through `crewContact` once the job is accepted, and
 * the first look is written to the audit log.
 *
 * contact_reveals requires a booking_id, so a crew reveal cannot live there
 * without a schema change; until then the audit row 'crew.contact_revealed'
 * is the record of who saw whom.
 */
import { and, desc, eq, inArray, notInArray, sql } from "drizzle-orm";
import { z } from "zod";
import { LEVELS, type LevelName } from "@/lib/levels";
import { isIsoDate, todayInNepal, type IsoDate } from "@/lib/nepali-date";
import { audit } from "../audit";
import * as s from "../db/schema";
import { type Db, slotsLeft } from "../providers";
import { onCrewJobCompleted, onNoShow } from "../rewards/earn";
import { levelsFor } from "../rewards/ledger";
import { haversineKm, MIN_REACH_KM } from "../search";

/** A no-show costs the freelancer this much reliability, floored at zero. */
export const NO_SHOW_RELIABILITY_PENALTY = 10;

/** Live statuses, as the partial unique index on (freelancer, day) counts them. */
const LIVE = ["offered", "accepted"] as const;
/** The studio may see the freelancer's contact from acceptance on. */
const CONTACTABLE = new Set<CrewJobStatus>(["accepted", "completed"]);

export type CrewJobStatus = (typeof s.crewJobStatusEnum.enumValues)[number];
export type CrewJob = typeof s.crewJobs.$inferSelect;

export class CrewError extends Error {
  constructor(
    public readonly code: "not_found" | "forbidden" | "not_a_studio" | "not_available" | "wrong_state" | "not_yet" | "bad_input",
    message: string,
  ) {
    super(message);
  }
}

const isoDay = z.string().refine(isIsoDate, "Pick a valid day.");

export const findCrewInput = z.object({
  day: isoDay,
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  role: z.string().trim().min(1).max(40).optional(),
});
export type FindCrewInput = z.infer<typeof findCrewInput>;

export const hireInput = z.object({
  freelancerProfileId: z.string().uuid(),
  day: isoDay,
  role: z.string().trim().min(1).max(40),
  dayRatePaisa: z.number().int().min(0),
  bookingId: z.string().uuid().optional(),
});
export type HireInput = z.infer<typeof hireInput>;

export const respondAction = z.enum(["accept", "decline"]);
export type RespondAction = z.infer<typeof respondAction>;

/** What a studio sees of a freelancer: the crew alias and track record, never a name or phone. */
export type CrewMatch = {
  profileId: string;
  alias: string;
  headline: string | null;
  roles: string[];
  level: LevelName;
  reliability: number;
  dayRate: number | null;
  distanceKm: number;
};

function parse<T>(schema: z.ZodType<T>, raw: unknown): T {
  const r = schema.safeParse(raw);
  if (!r.success) throw new CrewError("bad_input", r.error.issues[0]?.message ?? "Please check the form.");
  return r.data;
}

function isUniqueViolation(e: unknown): boolean {
  const err = e as { code?: string; cause?: { code?: string } };
  return err?.code === "23505" || err?.cause?.code === "23505";
}

/** The studio profile behind a user; only studios hire crew. */
async function studioFor(db: Db, userId: string) {
  const [p] = await db
    .select({ id: s.providerProfiles.id, kind: s.providerProfiles.kind, displayName: s.providerProfiles.displayName })
    .from(s.providerProfiles)
    .where(eq(s.providerProfiles.userId, userId));
  if (!p) throw new CrewError("not_found", "Set up your business profile before hiring crew.");
  if (p.kind !== "studio") throw new CrewError("not_a_studio", "Only a business can hire crew.");
  return p;
}

async function jobById(db: Db, jobId: string) {
  const [j] = await db.select().from(s.crewJobs).where(eq(s.crewJobs.id, jobId));
  if (!j) throw new CrewError("not_found", "That crew job could not be found.");
  return j;
}

/** The job, checked to belong to the studio whose user this is. */
async function businessJob(db: Db, businessUserId: string, jobId: string) {
  const [job, studio] = await Promise.all([jobById(db, jobId), studioFor(db, businessUserId)]);
  if (job.businessId !== studio.id) throw new CrewError("forbidden", "This crew job is not yours.");
  return job;
}

function levelRank(name: LevelName): number {
  return LEVELS.findIndex((l) => l.name === name);
}

/**
 * Verified freelancers free on `day` who reach the point: within the larger
 * of their service radius and the minimum reach, with no live job that day
 * and no blocked calendar. Reliability first, then level, then distance.
 * Day rate is shown and never sorted on.
 */
export async function findCrew(db: Db, businessUserId: string, raw: unknown, now: Date = new Date()): Promise<CrewMatch[]> {
  const q = parse(findCrewInput, raw);
  await studioFor(db, businessUserId);

  const busy = db
    .select({ id: s.crewJobs.freelancerId })
    .from(s.crewJobs)
    .where(and(eq(s.crewJobs.day, q.day), inArray(s.crewJobs.status, [...LIVE])));
  const conditions = [
    eq(s.providerProfiles.kind, "freelancer"),
    eq(s.providerProfiles.kycStatus, "verified"),
    notInArray(s.providerProfiles.id, busy),
  ];
  if (q.role) conditions.push(sql`${q.role} = any(${s.providerProfiles.crewRoles})`);
  const rows = await db
    .select({
      id: s.providerProfiles.id,
      userId: s.providerProfiles.userId,
      alias: s.providerProfiles.alias,
      headline: s.providerProfiles.crewHeadline,
      roles: s.providerProfiles.crewRoles,
      dayRate: s.providerProfiles.dayRate,
      reliability: s.providerProfiles.reliabilityScore,
      serviceRadiusKm: s.providerProfiles.serviceRadiusKm,
      lat: s.providerProfiles.lat,
      lng: s.providerProfiles.lng,
    })
    .from(s.providerProfiles)
    .where(and(...conditions));

  const point = { lat: q.lat, lng: q.lng };
  const reachable = rows
    .map((p) => ({ ...p, distanceKm: p.lat !== null && p.lng !== null ? haversineKm(point, { lat: p.lat, lng: p.lng }) : Infinity }))
    .filter((p) => p.distanceKm <= Math.max(p.serviceRadiusKm, MIN_REACH_KM));

  const [slots, levels] = await Promise.all([
    slotsLeft(db, reachable.map((p) => p.id), q.day as IsoDate, now),
    levelsFor(db, reachable.map((p) => p.userId)),
  ]);

  return reachable
    .filter((p) => (slots.get(p.id) ?? 0) > 0)
    .map<CrewMatch>((p) => ({
      profileId: p.id,
      alias: p.alias ?? "Crew",
      headline: p.headline,
      roles: p.roles,
      level: levels.get(p.userId) ?? "New",
      reliability: p.reliability,
      dayRate: p.dayRate,
      distanceKm: Math.round(p.distanceKm * 10) / 10,
    }))
    .sort((a, b) => b.reliability - a.reliability || levelRank(b.level) - levelRank(a.level) || a.distanceKm - b.distanceKm);
}

/**
 * Offers a freelancer one day's work. The partial unique index on
 * (freelancer, day) for live jobs is the double-booking guard; a conflict
 * surfaces as `not_available`.
 */
export async function hire(db: Db, businessUserId: string, raw: unknown): Promise<CrewJob> {
  const input = parse(hireInput, raw);
  const studio = await studioFor(db, businessUserId);
  const [freelancer] = await db
    .select({ id: s.providerProfiles.id, kind: s.providerProfiles.kind, kycStatus: s.providerProfiles.kycStatus })
    .from(s.providerProfiles)
    .where(eq(s.providerProfiles.id, input.freelancerProfileId));
  if (!freelancer || freelancer.kind !== "freelancer") throw new CrewError("not_found", "That crew member could not be found.");
  if (freelancer.kycStatus !== "verified") throw new CrewError("not_available", "This crew member is not verified yet.");

  let job: CrewJob;
  try {
    [job] = await db
      .insert(s.crewJobs)
      .values({
        businessId: studio.id,
        freelancerId: freelancer.id,
        bookingId: input.bookingId ?? null,
        day: input.day,
        role: input.role,
        dayRate: input.dayRatePaisa,
        status: "offered",
      })
      .returning();
  } catch (e) {
    if (isUniqueViolation(e)) throw new CrewError("not_available", "This crew member already has a job that day.");
    throw e;
  }
  await audit(db, {
    actorId: businessUserId,
    action: "crew.offered",
    subjectType: "crew_job",
    subjectId: job.id,
    detail: { freelancerId: freelancer.id, day: input.day, role: input.role, dayRate: input.dayRatePaisa, bookingId: input.bookingId ?? null },
  });
  return job;
}

/** The freelancer accepts or declines an open offer. */
export async function respond(db: Db, freelancerUserId: string, jobId: string, rawAction: unknown): Promise<CrewJob> {
  const action = parse(respondAction, rawAction);
  const job = await jobById(db, jobId);
  const [freelancer] = await db.select({ userId: s.providerProfiles.userId }).from(s.providerProfiles).where(eq(s.providerProfiles.id, job.freelancerId));
  if (freelancer?.userId !== freelancerUserId) throw new CrewError("forbidden", "This offer is not yours.");
  if (job.status !== "offered") throw new CrewError("wrong_state", "This offer is no longer open.");

  const now = new Date();
  const [updated] = await db
    .update(s.crewJobs)
    .set(action === "accept" ? { status: "accepted", acceptedAt: now } : { status: "declined" })
    .where(and(eq(s.crewJobs.id, job.id), eq(s.crewJobs.status, "offered")))
    .returning();
  if (!updated) throw new CrewError("wrong_state", "This offer is no longer open.");
  await audit(db, { actorId: freelancerUserId, action: action === "accept" ? "crew.accepted" : "crew.declined", subjectType: "crew_job", subjectId: job.id });
  return updated;
}

/** The studio marks an accepted job done once its day has come; both sides earn points. */
export async function complete(db: Db, businessUserId: string, jobId: string, now: Date = new Date()): Promise<CrewJob> {
  const job = await businessJob(db, businessUserId, jobId);
  if (job.status !== "accepted") throw new CrewError("wrong_state", "Only an accepted job can be completed.");
  if (job.day > todayInNepal(now)) throw new CrewError("not_yet", "This job can be completed from its day onwards.");

  const [updated] = await db
    .update(s.crewJobs)
    .set({ status: "completed", completedAt: now })
    .where(and(eq(s.crewJobs.id, job.id), eq(s.crewJobs.status, "accepted")))
    .returning();
  if (!updated) throw new CrewError("wrong_state", "Only an accepted job can be completed.");
  await onCrewJobCompleted(db, job.id, now);
  await audit(db, { actorId: businessUserId, action: "crew.completed", subjectType: "crew_job", subjectId: job.id });
  return updated;
}

/** The crew member did not turn up: points penalty and a reliability drop for the freelancer. */
export async function markNoShow(db: Db, businessUserId: string, jobId: string, now: Date = new Date()): Promise<CrewJob> {
  const job = await businessJob(db, businessUserId, jobId);
  if (job.status !== "accepted") throw new CrewError("wrong_state", "Only an accepted job can be marked a no-show.");

  const [updated] = await db
    .update(s.crewJobs)
    .set({ status: "no_show" })
    .where(and(eq(s.crewJobs.id, job.id), eq(s.crewJobs.status, "accepted")))
    .returning();
  if (!updated) throw new CrewError("wrong_state", "Only an accepted job can be marked a no-show.");

  const [freelancer] = await db
    .update(s.providerProfiles)
    .set({ reliabilityScore: sql`greatest(${s.providerProfiles.reliabilityScore} - ${NO_SHOW_RELIABILITY_PENALTY}, 0)` })
    .where(eq(s.providerProfiles.id, job.freelancerId))
    .returning({ userId: s.providerProfiles.userId });
  if (!freelancer) throw new CrewError("not_found", "That crew member could not be found.");
  await onNoShow(db, { providerUserId: freelancer.userId, crewJobId: job.id }, now);
  await audit(db, { actorId: businessUserId, action: "crew.no_show", subjectType: "crew_job", subjectId: job.id, detail: { freelancerId: job.freelancerId } });
  return updated;
}

/**
 * The freelancer's name and phone for the studio, once the job is accepted.
 * The first look writes 'crew.contact_revealed' to the audit log.
 */
export async function crewContact(db: Db, businessUserId: string, jobId: string): Promise<{ name: string; phone: string }> {
  const job = await businessJob(db, businessUserId, jobId);
  if (!CONTACTABLE.has(job.status)) throw new CrewError("not_yet", "Contact details are shared once the crew member accepts.");

  const [row] = await db
    .select({ name: s.users.name, phone: s.users.phone, displayName: s.providerProfiles.displayName })
    .from(s.providerProfiles)
    .innerJoin(s.users, eq(s.users.id, s.providerProfiles.userId))
    .where(eq(s.providerProfiles.id, job.freelancerId));
  if (!row) throw new CrewError("not_found", "That crew member could not be found.");

  const seen = await db
    .select({ id: s.auditLog.id })
    .from(s.auditLog)
    .where(and(eq(s.auditLog.action, "crew.contact_revealed"), eq(s.auditLog.subjectType, "crew_job"), eq(s.auditLog.subjectId, job.id), eq(s.auditLog.actorId, businessUserId)))
    .limit(1);
  if (seen.length === 0) {
    await audit(db, { actorId: businessUserId, action: "crew.contact_revealed", subjectType: "crew_job", subjectId: job.id, detail: { freelancerId: job.freelancerId } });
  }
  return { name: row.name ?? row.displayName, phone: row.phone };
}

/** A freelancer's jobs, newest day first, with the hiring business named. */
export async function jobsForFreelancer(db: Db, freelancerUserId: string) {
  const [me] = await db.select({ id: s.providerProfiles.id }).from(s.providerProfiles).where(eq(s.providerProfiles.userId, freelancerUserId));
  if (!me) return [];
  return db
    .select({ job: s.crewJobs, businessName: s.providerProfiles.displayName, businessSlug: s.providerProfiles.slug })
    .from(s.crewJobs)
    .innerJoin(s.providerProfiles, eq(s.providerProfiles.id, s.crewJobs.businessId))
    .where(eq(s.crewJobs.freelancerId, me.id))
    .orderBy(desc(s.crewJobs.day), desc(s.crewJobs.createdAt));
}

/** A business's jobs, newest day first; crew are named by alias, contact comes through `crewContact`. */
export async function jobsForBusiness(db: Db, businessUserId: string) {
  const [me] = await db.select({ id: s.providerProfiles.id }).from(s.providerProfiles).where(eq(s.providerProfiles.userId, businessUserId));
  if (!me) return [];
  return db
    .select({ job: s.crewJobs, alias: s.providerProfiles.alias, headline: s.providerProfiles.crewHeadline })
    .from(s.crewJobs)
    .innerJoin(s.providerProfiles, eq(s.providerProfiles.id, s.crewJobs.freelancerId))
    .where(eq(s.crewJobs.businessId, me.id))
    .orderBy(desc(s.crewJobs.day), desc(s.crewJobs.createdAt));
}
