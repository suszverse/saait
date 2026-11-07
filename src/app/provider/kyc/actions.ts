"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z, ZodError } from "zod";
import { requireRole } from "@/server/auth/guards";
import { KycError, savePan, savePayout, saveIdentity, submitForReview, uploadDocument } from "@/server/kyc";
import { MAX_DOCUMENT_BYTES } from "@/server/storage";
import { kycDeps, providerForUser } from "@/server/provider-account";

export type KycFormState = { error?: string; ok?: boolean };

const KINDS = ["id_front", "id_back", "selfie", "pan_certificate", "payout_proof"] as const;
const kindSchema = z.enum(KINDS);

async function actor() {
  const user = await requireRole(["provider"], "/provider/kyc");
  const p = await providerForUser(user.id);
  if (!p) redirect("/provider/onboarding");
  return { userId: user.id, providerId: p.id };
}

function fail(e: unknown): KycFormState {
  if (e instanceof ZodError) return { error: e.issues[0].message };
  if (e instanceof KycError) return { error: e.message };
  throw e;
}

export async function uploadAction(_prev: KycFormState, form: FormData): Promise<KycFormState> {
  const a = await actor();
  const kind = kindSchema.safeParse(form.get("kind"));
  const file = form.get("file");
  if (!kind.success) return { error: "Unknown document." };
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a photo first." };
  if (file.size > MAX_DOCUMENT_BYTES) return { error: "That file is over 8 MB. Take the photo again at a lower size." };
  try {
    await uploadDocument(kycDeps(), a, kind.data, new Uint8Array(await file.arrayBuffer()));
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/provider/kyc");
  return { ok: true };
}

export async function identityAction(_prev: KycFormState, form: FormData): Promise<KycFormState> {
  const a = await actor();
  try {
    await saveIdentity(kycDeps(), a, { idType: form.get("idType"), idNumber: form.get("idNumber") });
  } catch (e) {
    return fail(e);
  }
  redirect("/provider/kyc?step=pan");
}

export async function panAction(_prev: KycFormState, form: FormData): Promise<KycFormState> {
  const a = await actor();
  try {
    await savePan(kycDeps(), a, { pan: form.get("pan"), vatRegistered: form.get("vat") === "yes" });
  } catch (e) {
    return fail(e);
  }
  redirect("/provider/kyc?step=payout");
}

export async function payoutAction(_prev: KycFormState, form: FormData): Promise<KycFormState> {
  const a = await actor();
  try {
    await savePayout(kycDeps(), a, { method: form.get("method"), accountName: form.get("accountName"), accountNumber: form.get("accountNumber") });
  } catch (e) {
    return fail(e);
  }
  redirect("/provider/kyc?step=review");
}

export async function submitAction(): Promise<KycFormState> {
  const a = await actor();
  try {
    await submitForReview(kycDeps(), a);
  } catch (e) {
    return fail(e);
  }
  redirect("/provider/kyc?step=review");
}
