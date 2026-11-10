"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { hasAcceptedCurrent } from "@/server/agreement";
import { otp } from "@/server/auth/service";
import { getSession } from "@/server/auth/session";
import { db } from "@/server/db";
import { parseReferralCode, recordReferral } from "@/server/rewards/referrals";
import { normalizeNepalPhone } from "@/server/sms";

/** The OTP service upserts the user, so a row this young was created by this sign-in. */
const FIRST_SIGN_IN_MS = 2 * 60_000;

export type LoginState = { step: "phone" | "code"; phone?: string; error?: string; next: string };

/** The previous state comes back from the browser too; never trust it. */
const prevState = z
  .object({ step: z.enum(["phone", "code"]), phone: z.string().max(20).optional(), next: z.string().max(200) })
  .catch({ step: "code", next: "/" });

/** Only same-site relative paths, so `next` cannot send anyone off-site. */
const nextPath = z
  .string()
  .regex(/^\/(?!\/)[\w\-/?=&%.+,]*$/)
  .catch("/");

const phoneSchema = z.object({ phone: z.string().trim().min(1, "Enter your mobile number."), next: nextPath });
const codeSchema = z.object({ code: z.string().trim().regex(/^\d{6}$/, "The code has 6 digits."), next: nextPath });

export async function requestCode(_prev: LoginState, form: FormData): Promise<LoginState> {
  const parsed = phoneSchema.safeParse({ phone: form.get("phone"), next: form.get("next") ?? "/" });
  const next = parsed.success ? parsed.data.next : "/";
  if (!parsed.success) return { step: "phone", next, error: parsed.error.issues[0].message };
  const phone = normalizeNepalPhone(parsed.data.phone);
  if (!phone) return { step: "phone", next, error: "That is not a Nepali mobile number. It starts with 97 or 98 and has 10 digits." };
  const r = await otp().request(phone);
  if (!r.ok) {
    return {
      step: "phone",
      next,
      error:
        r.reason === "locked"
          ? "This number is locked after two rejected verifications. Call us if you think this is wrong."
          : "Too many codes sent. Wait 15 minutes, then try again.",
    };
  }
  const session = await getSession();
  session.pendingPhone = phone;
  await session.save();
  return { step: "code", phone, next };
}

export async function verifyCode(rawPrev: LoginState, form: FormData): Promise<LoginState> {
  const parsedPrev = prevState.parse(rawPrev);
  const prev: LoginState = { step: parsedPrev.step, phone: parsedPrev.phone, next: nextPath.parse(parsedPrev.next) };
  const parsed = codeSchema.safeParse({ code: form.get("code"), next: form.get("next") ?? "/" });
  const next = parsed.success ? parsed.data.next : prev.next;
  if (!parsed.success) return { ...prev, next, error: parsed.error.issues[0].message };
  const session = await getSession();
  const phone = session.pendingPhone;
  if (!phone) return { step: "phone", next, error: "Start again: enter your number." };
  const r = await otp().verify(phone, parsed.data.code);
  if (!r.ok) {
    const error = {
      invalid: "That code is not right. Check the SMS and try again.",
      expired: "That code has expired. Ask for a new one.",
      too_many_attempts: "Too many wrong codes. Ask for a new one.",
      locked: "This number is locked. Call us if you think this is wrong.",
    }[r.reason];
    return { ...prev, next, error };
  }
  session.userId = r.user.id;
  session.phone = r.user.phone;
  session.role = r.user.role;
  session.pendingPhone = undefined;
  await session.save();
  // A user row created moments ago means this is the first sign-in; the join
  // link's `ref` rides in `next`. Never let a referral problem block sign-in.
  if (Date.now() - r.user.createdAt.getTime() < FIRST_SIGN_IN_MS) {
    const ref = parseReferralCode(new URL(next, "http://saait.local").searchParams.get("ref"));
    if (ref) await recordReferral(db(), { refereeId: r.user.id, code: ref }).catch(() => undefined);
  }
  const home = r.user.role === "provider" ? "/provider" : r.user.role === "client" ? "/" : "/admin/kyc";
  const target = next !== "/" ? next : home;
  // Everyone accepts the current terms once. A `next` already on the agreement
  // screen (from /join, carrying its kind) is kept as is; anything else is
  // wrapped so the user lands where they were going after agreeing.
  if (!(await hasAcceptedCurrent(db(), r.user.id))) {
    redirect(target.startsWith("/join/agree") ? target : `/join/agree?next=${encodeURIComponent(target)}`);
  }
  redirect(target);
}

export async function signOut() {
  const session = await getSession();
  session.destroy();
  redirect("/");
}
