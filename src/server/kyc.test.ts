import { randomBytes } from "node:crypto";
import { mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as s from "./db/schema";
import { CHECKLIST, decide, KycError, readDocument, readiness, savePan, savePayout, saveIdentity, startReview, submitForReview, uploadDocument, REQUIRED_DOCUMENTS, type Deps } from "./kyc";
import { localEncryptedStore } from "./storage/local-encrypted";
import type { SmsSender } from "./sms";

const client = postgres(process.env.DATABASE_URL_TEST ?? "", { max: 1, onnotice: () => {} });
const db = drizzle(client, { schema: s, casing: "snake_case" });
const sent: { to: string; body: string }[] = [];
const sms: SmsSender = { name: "test", send: async (to, body) => void sent.push({ to, body }) };
let dir: string;
let deps: Deps;
let actor: { userId: string; providerId: string };
let operator: { id: string; role: string };

const JPEG = (n = 64) => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...randomBytes(n)]);
const ALL = Object.fromEntries(CHECKLIST.map((c) => [c.key, true]));

let aliasSeq = 0;
async function newProvider(phone: string, slug: string) {
  const [u] = await db.insert(s.users).values({ phone, role: "provider" }).returning();
  // Freelancer profiles need a crew alias since migration 0002.
  const alias = `Crew T${aliasSeq % 10}-${String(++aliasSeq).padStart(3, "0")}`;
  const [p] = await db.insert(s.providerProfiles).values({ userId: u.id, slug, displayName: slug, alias }).returning();
  return { userId: u.id, providerId: p.id };
}

async function complete(a: { userId: string; providerId: string }, id = "27-01-71-00412", pan = "301245678", acct = "9812344471") {
  for (const k of REQUIRED_DOCUMENTS) await uploadDocument(deps, a, k, JPEG());
  await saveIdentity(deps, a, { idType: "citizenship", idNumber: id });
  await savePan(deps, a, { pan, vatRegistered: false });
  await savePayout(deps, a, { method: "khalti", accountName: "Anita Gurung", accountNumber: acct });
}

async function expectKyc(p: Promise<unknown>, code: KycError["code"]) {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof KycError && e.code === code);
}

beforeEach(async () => {
  await client`truncate table users, cities, service_categories, auspicious_dates restart identity cascade`;
  dir = await mkdtemp(path.join(tmpdir(), "saait-docs-"));
  deps = { db, store: localEncryptedStore(dir, "a".repeat(64)), sms };
  sent.length = 0;
  actor = await newProvider("+9779800000101", "anita");
  const [op] = await db.insert(s.users).values({ phone: "+9779800000900", role: "operator" }).returning();
  operator = { id: op.id, role: op.role };
});
afterAll(async () => {
  await client.end();
});

describe("documents", () => {
  it("encrypts at rest and round-trips for an operator, audited", async () => {
    const bytes = JPEG(256);
    const doc = await uploadDocument(deps, actor, "id_front", bytes);
    const [file] = await readdir(dir);
    const raw = await readFile(path.join(dir, file));
    expect(raw.includes(Buffer.from(bytes.slice(4, 64)))).toBe(false);
    const got = await readDocument(deps, operator, doc.id);
    expect(Buffer.from(got.bytes).equals(Buffer.from(bytes))).toBe(true);
    const logs = await db.select().from(s.auditLog).where(eq(s.auditLog.action, "kyc.document_viewed"));
    expect(logs).toHaveLength(1);
  });

  it("refuses tampered files", async () => {
    const doc = await uploadDocument(deps, actor, "id_front", JPEG());
    const f = path.join(dir, `${doc.storageKey}.bin`);
    const raw = await readFile(f);
    raw[raw.length - 1] ^= 1;
    await writeFile(f, raw);
    await expect(readDocument(deps, operator, doc.id)).rejects.toThrow();
  });

  it("is invisible to the provider and to clients", async () => {
    const doc = await uploadDocument(deps, actor, "id_front", JPEG());
    await expectKyc(readDocument(deps, { id: actor.userId, role: "provider" }, doc.id), "forbidden");
    await expectKyc(readDocument(deps, { id: actor.userId, role: "client" }, doc.id), "forbidden");
  });

  it("checks real file type and size", async () => {
    await expectKyc(uploadDocument(deps, actor, "id_front", new TextEncoder().encode("<script>")), "bad_file");
    await expectKyc(uploadDocument(deps, actor, "id_front", new Uint8Array()), "bad_file");
    await expectKyc(uploadDocument(deps, actor, "id_front", JPEG(8 * 1024 * 1024)), "too_large");
  });

  it("keeps only the latest photo of each kind current", async () => {
    await uploadDocument(deps, actor, "id_front", JPEG());
    await uploadDocument(deps, actor, "id_front", JPEG());
    const docs = await db.select().from(s.providerDocuments);
    expect(docs.filter((d) => d.supersededAt === null)).toHaveLength(1);
  });

  it("refuses another provider's upload", async () => {
    const other = await newProvider("+9779800000102", "other");
    await expectKyc(uploadDocument(deps, { userId: other.userId, providerId: actor.providerId }, "id_front", JPEG()), "forbidden");
  });
});

describe("details", () => {
  it("validates PAN with the design's message", async () => {
    await expect(savePan(deps, actor, { pan: "30124", vatRegistered: false })).rejects.toThrow("A PAN has 9 digits");
    await savePan(deps, actor, { pan: "३०१२४५६७८", vatRegistered: true });
    const [p] = await db.select().from(s.providerProfiles).where(eq(s.providerProfiles.id, actor.providerId));
    expect(p.panNumber).toBe("301245678");
  });

  it("reports a duplicate ID kindly", async () => {
    await saveIdentity(deps, actor, { idType: "citizenship", idNumber: "27-01-71-00412" });
    const other = await newProvider("+9779800000103", "dup");
    await expectKyc(saveIdentity(deps, other, { idType: "citizenship", idNumber: "27017100412" }), "duplicate");
  });
});

describe("changes after verification (section 15)", () => {
  async function verified() {
    await complete(actor);
    await submitForReview(deps, actor);
    await decide(deps, operator, actor.providerId, { decision: "approve", checklist: ALL });
  }
  const status = async () => (await db.select().from(s.providerProfiles).where(eq(s.providerProfiles.id, actor.providerId)))[0];

  it("re-verifies on a new ID number, PAN, photo or payout name", async () => {
    await complete(actor);
    for (const change of [
      () => saveIdentity(deps, actor, { idType: "passport", idNumber: "PA1234567" }),
      () => savePan(deps, actor, { pan: "309999999", vatRegistered: false }),
      () => uploadDocument(deps, actor, "selfie", JPEG()),
      () => savePayout(deps, actor, { method: "khalti", accountName: "Anita G.", accountNumber: "9812344471" }),
    ]) {
      await client`update provider_profiles set kyc_status = 'verified'`;
      await change();
      expect((await status()).kycStatus).toBe("reverification_due");
    }
  });

  it("does not re-verify when nothing changed", async () => {
    await verified();
    await savePan(deps, actor, { pan: "301245678", vatRegistered: false });
    await savePayout(deps, actor, { method: "khalti", accountName: "Anita Gurung", accountNumber: "98-1234-4471" });
    expect((await status()).kycStatus).toBe("verified");
  });

  it("restarts the 7-day payout hold on every payout change", async () => {
    await verified();
    const day0 = new Date("2026-11-08T06:00:00Z");
    await savePayout({ ...deps, now: () => day0 }, actor, { method: "esewa", accountName: "Anita Gurung", accountNumber: "9800000000" });
    expect((await status()).payoutHoldUntil).toBe("2026-11-15");
    const day6 = new Date("2026-11-14T06:00:00Z");
    await savePayout({ ...deps, now: () => day6 }, actor, { method: "esewa", accountName: "Anita Gurung", accountNumber: "9800000001" });
    expect((await status()).payoutHoldUntil).toBe("2026-11-21");
    expect((await db.select().from(s.auditLog).where(eq(s.auditLog.action, "kyc.changed.payout"))).length).toBe(2);
  });
});

describe("review flow", () => {
  it("will not submit until every document and detail is in", async () => {
    await uploadDocument(deps, actor, "id_front", JPEG());
    await expectKyc(submitForReview(deps, actor), "missing_details");
    await complete(actor);
    expect((await readiness(db, actor.providerId)).ready).toBe(true);
    await submitForReview(deps, actor);
    await expectKyc(uploadDocument(deps, actor, "selfie", JPEG()), "wrong_state");
  });

  it("approves only with all six checks, then the provider is verified", async () => {
    await complete(actor);
    await submitForReview(deps, actor);
    await startReview(deps, operator.id, actor.providerId);
    await expectKyc(decide(deps, operator, actor.providerId, { decision: "approve", checklist: { ...ALL, no_duplicates: false } }), "checklist_incomplete");
    await decide(deps, operator, actor.providerId, { decision: "approve", checklist: ALL });
    const [p] = await db.select().from(s.providerProfiles).where(eq(s.providerProfiles.id, actor.providerId));
    expect(p.kycStatus).toBe("verified");
    expect(p.reverifyBy).toBeTruthy();
    expect(sent.at(-1)?.body).toContain("you are verified");
    expect(await db.select().from(s.kycReviews)).toHaveLength(1);
    expect((await db.select().from(s.auditLog).where(eq(s.auditLog.action, "kyc.approve"))).length).toBe(1);
  });

  it("requires a note to reject, allows one resubmission, then locks the phone 90 days", async () => {
    await complete(actor);
    await submitForReview(deps, actor);
    await expect(decide(deps, operator, actor.providerId, { decision: "reject", checklist: {}, note: "" })).rejects.toThrow();
    await decide(deps, operator, actor.providerId, { decision: "reject", checklist: {}, note: "Selfie does not match the ID photo." });
    await submitForReview(deps, actor);
    const now = new Date();
    await decide({ ...deps, now: () => now }, operator, actor.providerId, { decision: "reject", checklist: {}, note: "Selfie still does not match." });
    const [u] = await db.select().from(s.users).where(eq(s.users.id, actor.userId));
    expect(u.phoneLockedUntil!.getTime() - now.getTime()).toBe(90 * 86_400_000);
    await expectKyc(submitForReview(deps, actor), "locked");
  });

  it("asks for a better photo without counting a rejection", async () => {
    await complete(actor);
    await submitForReview(deps, actor);
    await decide(deps, operator, actor.providerId, { decision: "better_photo", checklist: {}, note: "Back of ID has glare." });
    const [p] = await db.select().from(s.providerProfiles).where(eq(s.providerProfiles.id, actor.providerId));
    expect(p.kycStatus).toBe("registered");
    expect(p.kycRejections).toBe(0);
  });

  it("blocks approval when the payout account is on another profile", async () => {
    const other = await newProvider("+9779800000104", "twin");
    await complete(other, "11-11-11-11111", "111111111", "9812344471");
    await complete(actor);
    await submitForReview(deps, actor);
    await expectKyc(decide(deps, operator, actor.providerId, { decision: "approve", checklist: ALL }), "duplicate");
  });

  it("freezes a re-verification while the operator reviews it", async () => {
    await complete(actor);
    await submitForReview(deps, actor);
    await decide(deps, operator, actor.providerId, { decision: "approve", checklist: ALL });
    await savePayout(deps, actor, { method: "esewa", accountName: "Anita Gurung", accountNumber: "9800000000" });
    await expectKyc(decide(deps, operator, actor.providerId, { decision: "approve", checklist: ALL }), "wrong_state");
    await startReview(deps, operator.id, actor.providerId);
    await expectKyc(savePayout(deps, actor, { method: "esewa", accountName: "Attacker", accountNumber: "5555555555" }), "wrong_state");
    await decide(deps, operator, actor.providerId, { decision: "approve", checklist: ALL });
    const [p] = await db.select().from(s.providerProfiles).where(eq(s.providerProfiles.id, actor.providerId));
    expect(p.kycStatus).toBe("verified");
    expect(p.payoutAccountNumber).toBe("9800000000");
  });

  it("lets only one of two simultaneous decisions land", async () => {
    await complete(actor);
    await submitForReview(deps, actor);
    const results = await Promise.allSettled([
      decide(deps, operator, actor.providerId, { decision: "reject", checklist: {}, note: "Selfie does not match." }),
      decide(deps, operator, actor.providerId, { decision: "reject", checklist: {}, note: "Selfie does not match." }),
      decide(deps, operator, actor.providerId, { decision: "approve", checklist: ALL }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.select().from(s.kycReviews)).toHaveLength(1);
  });

  it("catches a payout account written differently", async () => {
    const other = await newProvider("+9779800000105", "twin2");
    await complete(other, "22-22-22-22222", "222222222", "98-1234-4471");
    await complete(actor);
    await submitForReview(deps, actor);
    await expectKyc(decide(deps, operator, actor.providerId, { decision: "approve", checklist: ALL }), "duplicate");
  });

  it("lifts the lock after 90 days with a fresh allowance", async () => {
    await complete(actor);
    await submitForReview(deps, actor);
    await decide(deps, operator, actor.providerId, { decision: "reject", checklist: {}, note: "Selfie does not match." });
    await submitForReview(deps, actor);
    await decide(deps, operator, actor.providerId, { decision: "reject", checklist: {}, note: "Still does not match." });
    await expectKyc(submitForReview(deps, actor), "locked");
    const later = new Date(Date.now() + 91 * 86_400_000);
    await submitForReview({ ...deps, now: () => later }, actor);
    const [p] = await db.select().from(s.providerProfiles).where(eq(s.providerProfiles.id, actor.providerId));
    expect(p.kycStatus).toBe("submitted");
    expect(p.kycRejections).toBe(0);
  });

  it("only operators decide", async () => {
    await complete(actor);
    await submitForReview(deps, actor);
    await expectKyc(decide(deps, { id: actor.userId, role: "provider" }, actor.providerId, { decision: "approve", checklist: ALL }), "forbidden");
  });

  it("re-verifies and holds payouts 7 days when a verified provider changes payout account (queue shows it)", async () => {
    await complete(actor);
    await submitForReview(deps, actor);
    await decide(deps, operator, actor.providerId, { decision: "approve", checklist: ALL });
    const r = await savePayout(deps, actor, { method: "esewa", accountName: "Anita Gurung", accountNumber: "9800000000" });
    expect(r.reverify).toBe(true);
    const [p] = await db.select().from(s.providerProfiles).where(eq(s.providerProfiles.id, actor.providerId));
    expect(p.kycStatus).toBe("reverification_due");
    expect(p.payoutHoldUntil).toBeTruthy();
  });
});
