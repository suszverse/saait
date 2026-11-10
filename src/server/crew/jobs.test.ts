import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { rupees } from "@/lib/money";
import * as s from "../db/schema";
import { CREW_JOB_POINTS, NO_SHOW_POINTS } from "../rewards/earn";
import { pointsBalance } from "../rewards/ledger";
import { complete, CrewError, crewContact, findCrew, hire, jobsForBusiness, jobsForFreelancer, markNoShow, NO_SHOW_RELIABILITY_PENALTY, respond } from "./jobs";

const client = postgres(process.env.DATABASE_URL_TEST ?? "", { max: 1, onnotice: () => {} });
const db = drizzle(client, { schema: s, casing: "snake_case" });

const PHONE_PREFIX = "+97798000077";
const NOW = new Date("2026-11-09T06:00:00Z"); // 11:45 in Nepal, 2026-11-09
const PAST_DAY = "2026-11-01";
const FUTURE_DAY = "2027-01-15";
// Butwal and Kathmandu are about 230 km apart.
const BUTWAL = { lat: 27.7006, lng: 83.4484 };
const KATHMANDU = { lat: 27.7172, lng: 85.324 };

type Party = { user: { id: string; role: string; phone: string; name: string }; profileId: string };
let studio: Party;
let otherStudio: Party;
let near: Party; // verified freelancer in Butwal
let nearToo: Party; // verified freelancer in Butwal, lower reliability
let unverified: Party; // Butwal, KYC submitted
let far: Party; // verified, Kathmandu
let seq = 0;

async function party(kind: "freelancer" | "studio", over: Partial<typeof s.providerProfiles.$inferInsert> = {}): Promise<Party> {
  const n = ++seq;
  const [user] = await db
    .insert(s.users)
    .values({ phone: `${PHONE_PREFIX}${String(n).padStart(2, "0")}`, role: "provider", name: `Real Name ${n}` })
    .returning();
  const [p] = await db
    .insert(s.providerProfiles)
    .values({
      userId: user.id,
      slug: `crew-jobs-test-${n}`,
      displayName: kind === "studio" ? `Studio ${n}` : `Freelancer ${n}`,
      kind,
      alias: kind === "freelancer" ? `Crew J${n}-00${n}` : null,
      crewHeadline: kind === "freelancer" ? "Second shooter, candid and low light" : null,
      crewRoles: kind === "freelancer" ? ["second_shooter", "drone"] : [],
      dayRate: kind === "freelancer" ? rupees(8_000) : null,
      kycStatus: "verified",
      ...BUTWAL,
      ...over,
    })
    .returning();
  return { user: { id: user.id, role: user.role, phone: user.phone, name: user.name! }, profileId: p.id };
}

async function offer(freelancer: Party = near, day = FUTURE_DAY, from: Party = studio) {
  return hire(db, from.user.id, { freelancerProfileId: freelancer.profileId, day, role: "second_shooter", dayRatePaisa: rupees(8_000) });
}

async function accepted(freelancer: Party = near, day = FUTURE_DAY) {
  const job = await offer(freelancer, day);
  return respond(db, freelancer.user.id, job.id, "accept");
}

async function rejects(p: Promise<unknown>, code: CrewError["code"]) {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof CrewError && e.code === code, `CrewError ${code}`);
}

/** Another agent may reset the shared test database mid-run; wait for the tables to come back. */
async function truncate() {
  for (let attempt = 0; ; attempt++) {
    try {
      // The reward ledger is append-only, so rows go with their users through the cascade.
      await client`truncate table users restart identity cascade`;
      return;
    } catch (e) {
      if (attempt >= 20 || !/does not exist|deadlock/.test(String(e))) throw e;
      await new Promise((r) => setTimeout(r, 500));
    }
  }
}

beforeEach(async () => {
  await truncate();
  seq = 0;
  studio = await party("studio");
  otherStudio = await party("studio");
  near = await party("freelancer", { reliabilityScore: 100 });
  nearToo = await party("freelancer", { reliabilityScore: 90 });
  unverified = await party("freelancer", { kycStatus: "submitted" });
  far = await party("freelancer", { ...KATHMANDU, serviceRadiusKm: 25 });
});
afterAll(async () => {
  await client.end();
});

describe("findCrew", () => {
  it("lists verified freelancers in reach by alias only, reliability first, never by day rate", async () => {
    // The cheaper freelancer is less reliable; they must still come second.
    await db.update(s.providerProfiles).set({ dayRate: rupees(3_000) }).where(eq(s.providerProfiles.id, nearToo.profileId));
    const found = await findCrew(db, studio.user.id, { day: FUTURE_DAY, ...BUTWAL }, NOW);
    const ids = found.map((f) => f.profileId);
    expect(ids).toEqual([near.profileId, nearToo.profileId]);
    expect(ids).not.toContain(unverified.profileId);
    expect(ids).not.toContain(far.profileId);
    for (const f of found) {
      expect(Object.keys(f).sort()).toEqual(["alias", "dayRate", "distanceKm", "headline", "level", "profileId", "reliability", "roles"]);
      expect(f.alias).toMatch(/^Crew /);
      expect(JSON.stringify(f)).not.toMatch(/Real Name|\+977/);
    }
    expect(found[0].level).toBe("New");
    expect(found[0].distanceKm).toBeLessThan(1);
  });

  it("filters by role and drops a freelancer with a live job that day", async () => {
    expect((await findCrew(db, studio.user.id, { day: FUTURE_DAY, ...BUTWAL, role: "editor" }, NOW)).length).toBe(0);
    await offer(near);
    const ids = (await findCrew(db, studio.user.id, { day: FUTURE_DAY, ...BUTWAL, role: "drone" }, NOW)).map((f) => f.profileId);
    expect(ids).toEqual([nearToo.profileId]);
    // Another day is unaffected.
    expect((await findCrew(db, studio.user.id, { day: "2027-01-16", ...BUTWAL }, NOW)).length).toBe(2);
  });

  it("is for studios only", async () => {
    await rejects(findCrew(db, near.user.id, { day: FUTURE_DAY, ...BUTWAL }, NOW), "not_a_studio");
  });
});

describe("hire and respond", () => {
  it("offers a job, audits it, and guards against a second live job that day", async () => {
    const job = await offer(near);
    expect(job.status).toBe("offered");
    expect(job.businessId).toBe(studio.profileId);
    const log = await db.select().from(s.auditLog).where(and(eq(s.auditLog.action, "crew.offered"), eq(s.auditLog.subjectId, job.id)));
    expect(log).toHaveLength(1);
    expect(log[0].actorId).toBe(studio.user.id);

    await rejects(offer(near, FUTURE_DAY, otherStudio), "not_available");
    // Declined frees the day again.
    await respond(db, near.user.id, job.id, "decline");
    const again = await offer(near, FUTURE_DAY, otherStudio);
    expect(again.status).toBe("offered");
  });

  it("refuses a freelancer as hirer and an unverified crew member", async () => {
    await rejects(offer(nearToo, FUTURE_DAY, near), "not_a_studio");
    await rejects(offer(unverified), "not_available");
  });

  it("lets only the freelancer answer, only once", async () => {
    const job = await offer(near);
    await rejects(respond(db, nearToo.user.id, job.id, "accept"), "forbidden");
    await rejects(respond(db, studio.user.id, job.id, "accept"), "forbidden");
    const acceptedJob = await respond(db, near.user.id, job.id, "accept");
    expect(acceptedJob.status).toBe("accepted");
    expect(acceptedJob.acceptedAt).not.toBeNull();
    await rejects(respond(db, near.user.id, job.id, "decline"), "wrong_state");
  });
});

describe("crewContact", () => {
  it("hides name and phone until the offer is accepted, then audits the first look once", async () => {
    const job = await offer(near);
    await rejects(crewContact(db, studio.user.id, job.id), "not_yet");
    const listed = await jobsForBusiness(db, studio.user.id);
    expect(JSON.stringify(listed)).not.toMatch(/Real Name|\+977/);
    expect(listed[0].alias).toBe(`Crew J3-003`);

    await respond(db, near.user.id, job.id, "accept");
    expect(await crewContact(db, studio.user.id, job.id)).toEqual({ name: near.user.name, phone: near.user.phone });
    await crewContact(db, studio.user.id, job.id);
    const reveals = await db.select().from(s.auditLog).where(and(eq(s.auditLog.action, "crew.contact_revealed"), eq(s.auditLog.subjectId, job.id)));
    expect(reveals).toHaveLength(1);
    expect(reveals[0].actorId).toBe(studio.user.id);

    await rejects(crewContact(db, otherStudio.user.id, job.id), "forbidden");
  });
});

describe("complete", () => {
  it("moves an accepted job on its day to completed and pays points to both sides", async () => {
    const job = await accepted(near, PAST_DAY);
    const done = await complete(db, studio.user.id, job.id, NOW);
    expect(done.status).toBe("completed");
    expect(done.completedAt).toEqual(NOW);
    expect(await pointsBalance(db, studio.user.id)).toBe(CREW_JOB_POINTS);
    expect(await pointsBalance(db, near.user.id)).toBe(CREW_JOB_POINTS);
    await rejects(complete(db, studio.user.id, job.id, NOW), "wrong_state");
  });

  it("waits for the day, needs acceptance, and is the business's call", async () => {
    const future = await accepted(near, FUTURE_DAY);
    await rejects(complete(db, studio.user.id, future.id, NOW), "not_yet");
    await rejects(complete(db, otherStudio.user.id, future.id, NOW), "forbidden");
    const pending = await offer(nearToo, PAST_DAY);
    await rejects(complete(db, studio.user.id, pending.id, NOW), "wrong_state");
  });
});

describe("markNoShow", () => {
  it("posts the penalty and lowers reliability by ten, never below zero", async () => {
    const job = await accepted(near, PAST_DAY);
    const marked = await markNoShow(db, studio.user.id, job.id, NOW);
    expect(marked.status).toBe("no_show");
    expect(await pointsBalance(db, near.user.id)).toBe(-NO_SHOW_POINTS);
    expect(await pointsBalance(db, studio.user.id)).toBe(0);
    const [p] = await db.select({ r: s.providerProfiles.reliabilityScore }).from(s.providerProfiles).where(eq(s.providerProfiles.id, near.profileId));
    expect(p.r).toBe(100 - NO_SHOW_RELIABILITY_PENALTY);

    await db.update(s.providerProfiles).set({ reliabilityScore: 4 }).where(eq(s.providerProfiles.id, near.profileId));
    const second = await accepted(near, "2026-11-02");
    await markNoShow(db, studio.user.id, second.id, NOW);
    const [floor] = await db.select({ r: s.providerProfiles.reliabilityScore }).from(s.providerProfiles).where(eq(s.providerProfiles.id, near.profileId));
    expect(floor.r).toBe(0);
  });

  it("needs an accepted job", async () => {
    const job = await offer(near, PAST_DAY);
    await rejects(markNoShow(db, studio.user.id, job.id, NOW), "wrong_state");
  });
});

describe("lists", () => {
  it("shows each side its own jobs, newest day first", async () => {
    await offer(near, "2027-01-10");
    await offer(near, "2027-01-20");
    await offer(nearToo, "2027-01-20", otherStudio);
    const mine = await jobsForFreelancer(db, near.user.id);
    expect(mine.map((j) => j.job.day)).toEqual(["2027-01-20", "2027-01-10"]);
    expect(mine[0].businessName).toBe("Studio 1");
    expect(await jobsForFreelancer(db, nearToo.user.id)).toHaveLength(1);
    expect(await jobsForBusiness(db, studio.user.id)).toHaveLength(2);
    expect(await jobsForBusiness(db, otherStudio.user.id)).toHaveLength(1);
  });
});
