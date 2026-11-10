import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import * as s from "../db/schema";
import { ensureReferralCode, parseReferralCode, recordReferral, REFERRAL_CODE_LENGTH } from "./referrals";

const client = postgres(process.env.DATABASE_URL_TEST ?? "", { max: 1, onnotice: () => {} });
const db = drizzle(client, { schema: s, casing: "snake_case" });

let seq = 0;
async function newUser() {
  const [u] = await db
    .insert(s.users)
    .values({ phone: `+97798${String(70_000_000 + ++seq)}`, role: "client" })
    .returning();
  return u;
}

afterAll(() => client.end());

describe("ensureReferralCode", () => {
  it("assigns an 8 character Crockford code once and returns it again", async () => {
    const u = await newUser();
    const code = await ensureReferralCode(db, u.id);
    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/);
    expect(code).toHaveLength(REFERRAL_CODE_LENGTH);
    expect(await ensureReferralCode(db, u.id)).toBe(code);
  });

  it("gives every user a different code", async () => {
    const users = await Promise.all(Array.from({ length: 20 }, newUser));
    const codes = await Promise.all(users.map((u) => ensureReferralCode(db, u.id)));
    expect(new Set(codes).size).toBe(20);
  });
});

describe("recordReferral", () => {
  it("records a referral for a new user with another user's code", async () => {
    const referrer = await newUser();
    const referee = await newUser();
    const code = await ensureReferralCode(db, referrer.id);
    expect(await recordReferral(db, { refereeId: referee.id, code })).toEqual({ recorded: true, reason: "recorded" });
    const rows = await db.select().from(s.referrals).where(eq(s.referrals.refereeId, referee.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].referrerId).toBe(referrer.id);
  });

  it("rejects self-referral", async () => {
    const u = await newUser();
    const code = await ensureReferralCode(db, u.id);
    expect(await recordReferral(db, { refereeId: u.id, code })).toEqual({ recorded: false, reason: "self_referral" });
  });

  it("ignores a second referral", async () => {
    const a = await newUser();
    const b = await newUser();
    const referee = await newUser();
    const first = await ensureReferralCode(db, a.id);
    const second = await ensureReferralCode(db, b.id);
    await recordReferral(db, { refereeId: referee.id, code: first });
    expect(await recordReferral(db, { refereeId: referee.id, code: second })).toEqual({ recorded: false, reason: "already_referred" });
    const rows = await db.select().from(s.referrals).where(eq(s.referrals.refereeId, referee.id));
    expect(rows.map((r) => r.referrerId)).toEqual([a.id]);
  });

  it("ignores unknown or malformed codes", async () => {
    const referee = await newUser();
    expect((await recordReferral(db, { refereeId: referee.id, code: "ZZZZZZZZ" })).reason).toBe("unknown_code");
    expect((await recordReferral(db, { refereeId: referee.id, code: "nope" })).recorded).toBe(false);
  });
});

describe("parseReferralCode", () => {
  it("accepts lower case and confuses O, I and L with 0 and 1", () => {
    expect(parseReferralCode(" abcd0o1l ")).toBe("ABCD0011");
    expect(parseReferralCode("short")).toBeNull();
    expect(parseReferralCode(undefined)).toBeNull();
  });
});
