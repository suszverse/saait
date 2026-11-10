/**
 * Referral codes. Each user gets one short code on first need; a new user who
 * arrives with someone else's code gets a referrals row, once. The referrer is
 * credited later, when the referee's first booking completes (see earn.ts).
 */
import { randomInt } from "node:crypto";
import { eq } from "drizzle-orm";
import * as s from "../db/schema";
import type { Db } from "../providers";

/** Crockford base32: no I, L, O or U, so a code read aloud or typed from SMS survives. */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const REFERRAL_CODE_LENGTH = 8;
const MAX_ATTEMPTS = 8;

export function newReferralCode(): string {
  let code = "";
  for (let i = 0; i < REFERRAL_CODE_LENGTH; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  return code;
}

/** Normalise what a person typed or a link carried; null when it cannot be a code. */
export function parseReferralCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const code = raw.trim().toUpperCase().replace(/O/g, "0").replace(/[IL]/g, "1");
  return new RegExp(`^[${ALPHABET}]{${REFERRAL_CODE_LENGTH}}$`).test(code) ? code : null;
}

/** The user's code, assigned on first call and stable afterwards. */
export async function ensureReferralCode(db: Db, userId: string): Promise<string> {
  const [row] = await db.select({ code: s.users.referralCode }).from(s.users).where(eq(s.users.id, userId));
  if (!row) throw new Error("user not found");
  if (row.code) return row.code;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    // The unique index decides collisions; the null guard keeps a concurrent first call from overwriting.
    const [set] = await db
      .update(s.users)
      .set({ referralCode: newReferralCode() })
      .where(eq(s.users.id, userId))
      .returning({ code: s.users.referralCode })
      .catch((e: unknown) => {
        if (isUniqueViolation(e)) return [];
        throw e;
      });
    if (set?.code) return set.code;
  }
  throw new Error("could not assign a referral code");
}

function isUniqueViolation(e: unknown): boolean {
  const err = e as { code?: string; cause?: { code?: string } };
  return err?.code === "23505" || err?.cause?.code === "23505";
}

export type RecordReferralResult = {
  recorded: boolean;
  reason: "recorded" | "unknown_code" | "self_referral" | "already_referred";
};

export async function recordReferral(db: Db, input: { refereeId: string; code: string }): Promise<RecordReferralResult> {
  const code = parseReferralCode(input.code);
  if (!code) return { recorded: false, reason: "unknown_code" };
  const [referrer] = await db.select({ id: s.users.id }).from(s.users).where(eq(s.users.referralCode, code));
  if (!referrer) return { recorded: false, reason: "unknown_code" };
  if (referrer.id === input.refereeId) return { recorded: false, reason: "self_referral" };
  const inserted = await db
    .insert(s.referrals)
    .values({ referrerId: referrer.id, refereeId: input.refereeId })
    .onConflictDoNothing({ target: s.referrals.refereeId })
    .returning({ id: s.referrals.id });
  return inserted.length ? { recorded: true, reason: "recorded" } : { recorded: false, reason: "already_referred" };
}
