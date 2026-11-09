import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import * as s from "./db/schema";
import { acceptAgreement, AgreementError, currentAgreementVersion, hasAcceptedCurrent } from "./agreement";

const client = postgres(process.env.DATABASE_URL_TEST ?? "", { max: 1, onnotice: () => {} });
const db = drizzle(client, { schema: s, casing: "snake_case" });
let userId: string;

beforeAll(async () => {
  const [u] = await db.insert(s.users).values({ phone: "+9779800009901" }).returning();
  userId = u.id;
});
afterAll(async () => {
  await db.delete(s.auditLog).where(eq(s.auditLog.subjectId, userId));
  await db.delete(s.users).where(eq(s.users.id, userId));
  await client.end();
});

describe("agreement acceptance", () => {
  it("knows the current version", () => {
    expect(currentAgreementVersion()).toBe("2026-11-09");
  });

  it("refuses a stale version", async () => {
    await expect(acceptAgreement(db, userId, { version: "2020-01-01", accepted: true })).rejects.toBeInstanceOf(AgreementError);
    await expect(acceptAgreement(db, userId, { version: "2020-01-01", accepted: true })).rejects.toMatchObject({ code: "stale_version" });
  });

  it("rejects accepted:false at the zod boundary", async () => {
    await expect(acceptAgreement(db, userId, { version: currentAgreementVersion(), accepted: false })).rejects.toBeInstanceOf(ZodError);
  });

  it("is idempotent and audits only the first acceptance", async () => {
    const version = currentAgreementVersion();
    expect(await hasAcceptedCurrent(db, userId)).toBe(false);

    const first = await acceptAgreement(db, userId, { version, accepted: true });
    expect(first.inserted).toBe(true);
    expect(await hasAcceptedCurrent(db, userId)).toBe(true);

    const second = await acceptAgreement(db, userId, { version, accepted: true });
    expect(second.inserted).toBe(false);

    const rows = await db.select().from(s.agreementAcceptances).where(eq(s.agreementAcceptances.userId, userId));
    expect(rows).toHaveLength(1);
    expect(rows[0].version).toBe(version);

    const audits = await db
      .select()
      .from(s.auditLog)
      .where(and(eq(s.auditLog.action, "agreement.accepted"), eq(s.auditLog.subjectId, userId)));
    expect(audits).toHaveLength(1);
    expect(audits[0].subjectType).toBe("user");
    expect(audits[0].actorId).toBe(userId);
  });
});
