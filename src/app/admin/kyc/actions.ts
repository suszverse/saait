"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z, ZodError } from "zod";
import { eq } from "drizzle-orm";
import { requireRole } from "@/server/auth/guards";
import { db, schema as s } from "@/server/db";
import { CHECKLIST, decide, KycError, startReview } from "@/server/kyc";
import { kycDeps } from "@/server/provider-account";

export type DecisionState = { error?: string };
const idSchema = z.string().uuid();

export async function openReview(form: FormData) {
  const op = await requireRole(["operator", "admin"], "/admin/kyc");
  const id = idSchema.parse(form.get("providerId"));
  await startReview(kycDeps(), op.id, id);
  revalidatePath(`/admin/kyc/${id}`);
}

export async function decideAction(_prev: DecisionState, form: FormData): Promise<DecisionState> {
  const op = await requireRole(["operator", "admin"], "/admin/kyc");
  const id = idSchema.safeParse(form.get("providerId"));
  if (!id.success) return { error: "Unknown provider." };
  // The desk decides only on a review it opened, so what is approved is what
  // was frozen and looked at.
  const [p] = await db().select({ status: s.providerProfiles.kycStatus }).from(s.providerProfiles).where(eq(s.providerProfiles.id, id.data));
  if (p?.status !== "under_review") return { error: "Open the review first." };
  const checklist = Object.fromEntries(CHECKLIST.map((c) => [c.key, form.get(`check_${c.key}`) === "on"]));
  const decision = form.get("decision");
  const note = String(form.get("note") ?? "").trim();
  if (decision !== "approve" && decision !== "reject" && decision !== "better_photo") return { error: "Pick a decision." };
  try {
    await decide(kycDeps(), { id: op.id, role: op.role }, id.data, { decision, checklist, note: decision === "approve" ? note || undefined : note });
  } catch (e) {
    if (e instanceof ZodError) return { error: e.issues[0].message };
    if (e instanceof KycError) return { error: e.message };
    throw e;
  }
  redirect("/admin/kyc");
}
