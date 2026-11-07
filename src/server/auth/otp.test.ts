import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as s from "../db/schema";
import { normalizeNepalPhone, type SmsSender } from "../sms";
import { createOtpService, hashCode, OTP_TTL_MS } from "./otp";

const client = postgres(process.env.DATABASE_URL_TEST ?? "", { max: 1, onnotice: () => {} });
const db = drizzle(client, { schema: s, casing: "snake_case" });
const phone = "+9779811111111";
let clock = new Date("2027-02-24T04:00:00Z");
let next = "123456";
const sent: string[] = [];
const sms: SmsSender = { name: "test", send: async (_to, body) => void sent.push(body) };
const svc = () => createOtpService({ db, sms, secret: "x".repeat(32), now: () => clock, generate: () => next });

beforeEach(async () => {
  await client`truncate table otp_codes, users restart identity cascade`;
  clock = new Date("2027-02-24T04:00:00Z");
  next = "123456";
  sent.length = 0;
});
afterAll(async () => {
  await client.end();
});

describe("phone numbers", () => {
  it("normalises Nepali mobiles to E.164", () => {
    expect(normalizeNepalPhone("9812345678")).toBe("+9779812345678");
    expect(normalizeNepalPhone("+977 981-234-5678")).toBe("+9779812345678");
    expect(normalizeNepalPhone("९८१२३४५६७८")).toBe("+9779812345678");
    expect(normalizeNepalPhone("01-4412345")).toBeNull();
    expect(normalizeNepalPhone("98123")).toBeNull();
  });
});

describe("otp", () => {
  it("sends a code and stores only its hash", async () => {
    expect(await svc().request(phone)).toEqual({ ok: true });
    expect(sent[0]).toContain("123456");
    const [row] = await db.select().from(s.otpCodes);
    expect(row.codeHash).toBe(hashCode("x".repeat(32), phone, "123456"));
    expect(row.codeHash).not.toContain("123456");
  });

  it("signs in with the right code once, creating the user as a client", async () => {
    await svc().request(phone);
    const r = await svc().verify(phone, "123456");
    expect(r.ok && r.user.role).toBe("client");
    expect((await svc().verify(phone, "123456")).ok).toBe(false);
  });

  it("expires codes after five minutes", async () => {
    await svc().request(phone);
    clock = new Date(clock.getTime() + OTP_TTL_MS + 1);
    expect(await svc().verify(phone, "123456")).toEqual({ ok: false, reason: "expired" });
  });

  it("locks a code after five wrong attempts, even if the sixth is right", async () => {
    await svc().request(phone);
    for (let i = 0; i < 4; i++) expect(await svc().verify(phone, "000000")).toEqual({ ok: false, reason: "invalid" });
    expect(await svc().verify(phone, "000000")).toEqual({ ok: false, reason: "too_many_attempts" });
    expect(await svc().verify(phone, "123456")).toEqual({ ok: false, reason: "too_many_attempts" });
  });

  it("holds the five-attempt limit under parallel guessing", async () => {
    await svc().request(phone);
    const results = await Promise.all(Array.from({ length: 40 }, () => svc().verify(phone, "000000")));
    expect(results.filter((r) => !r.ok && r.reason === "invalid").length).toBeLessThanOrEqual(4);
    const [row] = await db.select().from(s.otpCodes);
    expect(row.attempts).toBe(5);
    expect(await svc().verify(phone, "123456")).toEqual({ ok: false, reason: "too_many_attempts" });
  });

  it("retires older codes when a new one is sent", async () => {
    await svc().request(phone);
    next = "654321";
    await svc().request(phone);
    expect((await svc().verify(phone, "123456")).ok).toBe(false);
    expect((await svc().verify(phone, "654321")).ok).toBe(true);
  });

  it("allows three codes per phone in fifteen minutes", async () => {
    for (let i = 0; i < 3; i++) expect((await svc().request(phone)).ok).toBe(true);
    expect(await svc().request(phone)).toEqual({ ok: false, reason: "rate_limited" });
    clock = new Date(clock.getTime() + 16 * 60_000);
    expect((await svc().request(phone)).ok).toBe(true);
  });

  it("refuses a phone locked after a second KYC rejection", async () => {
    await db.insert(s.users).values({ phone, phoneLockedUntil: new Date(clock.getTime() + 86_400_000) });
    expect(await svc().request(phone)).toEqual({ ok: false, reason: "locked" });
  });

  it("keeps an existing user's role", async () => {
    await db.insert(s.users).values({ phone, role: "operator" });
    await svc().request(phone);
    const r = await svc().verify(phone, "123456");
    expect(r.ok && r.user.role).toBe("operator");
    const [u] = await db.select().from(s.users).where(eq(s.users.phone, phone));
    expect(u.role).toBe("operator");
  });
});
