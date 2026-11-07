/**
 * Phone OTP. Codes are 6 digits, stored only as an HMAC, expire after 5
 * minutes, allow 5 attempts in total (counted atomically, so parallel
 * guesses cannot bypass the limit), only the newest code is live, and a
 * phone may request at most 3 codes in 15 minutes. Works on any Drizzle database so it can be tested directly.
 */
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { and, desc, eq, gt, isNull, lt, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as s from "../db/schema";
import type { SmsSender } from "../sms";

export const OTP_TTL_MS = 5 * 60_000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_WINDOW_MS = 15 * 60_000;
export const OTP_MAX_PER_WINDOW = 3;

type Db = PostgresJsDatabase<typeof s>;

export type RequestResult = { ok: true } | { ok: false; reason: "rate_limited" | "locked" };
export type VerifyResult =
  | { ok: true; user: typeof s.users.$inferSelect }
  | { ok: false; reason: "invalid" | "expired" | "too_many_attempts" | "locked" };

export function hashCode(secret: string, phone: string, code: string): string {
  return createHmac("sha256", secret).update(`${phone}:${code}`).digest("hex");
}

export function createOtpService(deps: { db: Db; sms: SmsSender; secret: string; now?: () => Date; generate?: () => string }) {
  const now = deps.now ?? (() => new Date());
  const generate = deps.generate ?? (() => String(randomInt(0, 1_000_000)).padStart(6, "0"));

  async function isLocked(phone: string) {
    const [u] = await deps.db.select({ until: s.users.phoneLockedUntil }).from(s.users).where(eq(s.users.phone, phone));
    return !!u?.until && u.until > now();
  }

  return {
    async request(phone: string): Promise<RequestResult> {
      if (await isLocked(phone)) return { ok: false, reason: "locked" };
      const since = new Date(now().getTime() - OTP_WINDOW_MS);
      const [{ n }] = await deps.db
        .select({ n: sql<number>`count(*)::int` })
        .from(s.otpCodes)
        .where(and(eq(s.otpCodes.phone, phone), gt(s.otpCodes.createdAt, since)));
      if (n >= OTP_MAX_PER_WINDOW) return { ok: false, reason: "rate_limited" };
      const code = generate();
      // Only the newest code is live: retire any earlier unused ones.
      await deps.db
        .update(s.otpCodes)
        .set({ consumedAt: now() })
        .where(and(eq(s.otpCodes.phone, phone), isNull(s.otpCodes.consumedAt)));
      await deps.db.insert(s.otpCodes).values({
        phone,
        codeHash: hashCode(deps.secret, phone, code),
        expiresAt: new Date(now().getTime() + OTP_TTL_MS),
        createdAt: now(),
      });
      await deps.sms.send(phone, `Saait: your sign-in code is ${code}. It expires in 5 minutes. Do not share it.`, "otp");
      return { ok: true };
    },

    async verify(phone: string, code: string): Promise<VerifyResult> {
      if (await isLocked(phone)) return { ok: false, reason: "locked" };
      const [row] = await deps.db
        .select()
        .from(s.otpCodes)
        .where(and(eq(s.otpCodes.phone, phone), isNull(s.otpCodes.consumedAt)))
        .orderBy(desc(s.otpCodes.createdAt))
        .limit(1);
      if (!row) return { ok: false, reason: "invalid" };
      if (row.expiresAt <= now()) return { ok: false, reason: "expired" };
      // Reserve one attempt atomically before comparing. Parallel guesses each
      // take a slot or are refused; they can never overwrite each other.
      const reserved = await deps.db
        .update(s.otpCodes)
        .set({ attempts: sql`${s.otpCodes.attempts} + 1` })
        .where(and(eq(s.otpCodes.id, row.id), isNull(s.otpCodes.consumedAt), lt(s.otpCodes.attempts, OTP_MAX_ATTEMPTS)))
        .returning({ attempts: s.otpCodes.attempts });
      if (reserved.length === 0) return { ok: false, reason: "too_many_attempts" };
      const expected = Buffer.from(row.codeHash, "hex");
      const given = Buffer.from(hashCode(deps.secret, phone, code), "hex");
      if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
        return { ok: false, reason: reserved[0].attempts >= OTP_MAX_ATTEMPTS ? "too_many_attempts" : "invalid" };
      }
      // Consume atomically so a code works once even under a double submit.
      const consumed = await deps.db
        .update(s.otpCodes)
        .set({ consumedAt: now() })
        .where(and(eq(s.otpCodes.id, row.id), isNull(s.otpCodes.consumedAt)))
        .returning({ id: s.otpCodes.id });
      if (consumed.length === 0) return { ok: false, reason: "invalid" };
      const [user] = await deps.db
        .insert(s.users)
        .values({ phone })
        .onConflictDoUpdate({ target: s.users.phone, set: { phone } })
        .returning();
      return { ok: true, user };
    },
  };
}
