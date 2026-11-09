import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import { acceptAgreement, currentAgreementVersion } from "./agreement";
import { ALIAS_PATTERN } from "./crew/alias";
import * as s from "./db/schema";

// The module is marked server-only for Next; the marker throws anywhere else.
vi.mock("server-only", () => ({}));
const { createProviderProfile, ProviderAccountError, TRIAL_DAYS } = await import("./provider-account");

const client = postgres(process.env.DATABASE_URL_TEST ?? "", { max: 1, onnotice: () => {} });
const db = drizzle(client, { schema: s, casing: "snake_case" });
const users: string[] = [];

async function newUser(phone: string, accepted = true) {
  const [u] = await db.insert(s.users).values({ phone }).returning();
  users.push(u.id);
  if (accepted) await acceptAgreement(db, u.id, { version: currentAgreementVersion(), accepted: true });
  return { id: u.id, role: u.role };
}

const studio = { kind: "studio", fullName: "Sita Shrestha", businessName: "Shrestha Studio Pvt. Ltd.", displayName: "Shrestha Studio", city: "test-city", categories: ["test-wedding"] };
const freelancer = { kind: "freelancer", fullName: "Ram Pokhrel", headline: "Candid second shooter, 6 seasons", roles: ["Second shooter", "Candid"], dayRate: "5000", bio: "Sony kit, Butwal based.", city: "test-city" };

beforeAll(async () => {
  await db.insert(s.cities).values({ slug: "test-city", name: "Test City", cluster: "test", lat: 27.7, lng: 83.4 }).onConflictDoNothing({ target: s.cities.slug });
  await db.insert(s.serviceCategories).values({ slug: "test-wedding", name: "Test wedding", shortName: "Wedding" }).onConflictDoNothing({ target: s.serviceCategories.slug });
});
afterAll(async () => {
  for (const id of users) {
    const [p] = await db.select({ id: s.providerProfiles.id }).from(s.providerProfiles).where(eq(s.providerProfiles.userId, id));
    if (p) {
      await db.delete(s.subscriptions).where(eq(s.subscriptions.providerId, p.id));
      await db.delete(s.packages).where(eq(s.packages.providerId, p.id));
      await db.delete(s.providerCategories).where(eq(s.providerCategories.providerId, p.id));
      await db.delete(s.providerProfiles).where(eq(s.providerProfiles.id, p.id));
    }
    await db.delete(s.auditLog).where(eq(s.auditLog.subjectId, id));
    await db.delete(s.users).where(eq(s.users.id, id));
  }
  await db.delete(s.serviceCategories).where(eq(s.serviceCategories.slug, "test-wedding"));
  await db.delete(s.cities).where(eq(s.cities.slug, "test-city"));
  await client.end();
});

describe("createProviderProfile", () => {
  it("starts a studio on Business with a 30-day trial subscription", async () => {
    const u = await newUser("+9779800009921");
    const p = await createProviderProfile(db, u, studio);
    expect(p.kind).toBe("studio");
    expect(p.plan).toBe("pro");
    expect(p.businessName).toBe("Shrestha Studio Pvt. Ltd.");
    expect(p.displayName).toBe("Shrestha Studio");
    expect(p.alias).toBeNull();
    const subs = await db.select().from(s.subscriptions).where(eq(s.subscriptions.providerId, p.id));
    expect(subs).toHaveLength(1);
    expect(subs[0]).toMatchObject({ plan: "pro", price: 0, currency: "NPR" });
    const days = (new Date(subs[0].periodEnd).getTime() - new Date(subs[0].periodStart).getTime()) / 86_400_000;
    expect(days).toBe(TRIAL_DAYS);
    const pkgs = await db.select().from(s.packages).where(eq(s.packages.providerId, p.id));
    expect(pkgs.length).toBeGreaterThan(0);
  });

  it("gives a freelancer a crew handle as their display name and stays on free", async () => {
    const u = await newUser("+9779800009922");
    const p = await createProviderProfile(db, u, freelancer);
    expect(p.kind).toBe("freelancer");
    expect(p.plan).toBe("free");
    expect(p.alias).toMatch(ALIAS_PATTERN);
    expect(p.displayName).toBe(p.alias);
    expect(p.crewHeadline).toBe("Candid second shooter, 6 seasons");
    expect(p.crewRoles).toEqual(["Second shooter", "Candid"]);
    expect(p.dayRate).toBe(500_000);
    expect(p.bio).toBe("Sony kit, Butwal based.");
    expect(await db.select().from(s.subscriptions).where(eq(s.subscriptions.providerId, p.id))).toHaveLength(0);
    const [user] = await db.select().from(s.users).where(eq(s.users.id, u.id));
    expect(user.role).toBe("provider");
    expect(user.name).toBe("Ram Pokhrel");
  });

  it("rejects a headline that names a business or carries a phone number, on the headline field", async () => {
    const u = await newUser("+9779800009923");
    const p = createProviderProfile(db, u, { ...freelancer, headline: "Second shooter at Butwal Films 9841234567" });
    await expect(p).rejects.toBeInstanceOf(ZodError);
    await expect(p).rejects.toSatisfy((e: unknown) => e instanceof ZodError && e.issues[0].path[0] === "headline");
    expect(await db.select().from(s.providerProfiles).where(eq(s.providerProfiles.userId, u.id))).toHaveLength(0);
  });

  it("refuses a user who has not accepted the current terms", async () => {
    const u = await newUser("+9779800009924", false);
    const p = createProviderProfile(db, u, studio);
    await expect(p).rejects.toBeInstanceOf(ProviderAccountError);
    await expect(p).rejects.toMatchObject({ code: "agreement_required" });
    expect(await db.select().from(s.providerProfiles).where(eq(s.providerProfiles.userId, u.id))).toHaveLength(0);
  });

  it("validates each kind's own fields at the zod boundary", async () => {
    const u = await newUser("+9779800009925");
    await expect(createProviderProfile(db, u, { ...studio, businessName: undefined })).rejects.toBeInstanceOf(ZodError);
    await expect(createProviderProfile(db, u, { ...freelancer, dayRate: "500" })).rejects.toBeInstanceOf(ZodError);
    await expect(createProviderProfile(db, u, { ...freelancer, roles: ["Catering"] })).rejects.toBeInstanceOf(ZodError);
    await expect(createProviderProfile(db, u, { ...freelancer, roles: [] })).rejects.toBeInstanceOf(ZodError);
    await expect(createProviderProfile(db, u, { ...freelancer, kind: "agency" })).rejects.toBeInstanceOf(ZodError);
  });
});
