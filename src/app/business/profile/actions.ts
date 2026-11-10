"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { env } from "@/env";
import { requireProviderKind } from "@/server/auth/guards";
import { db } from "@/server/db";
import { PortfolioError, removeItem } from "@/server/portfolio";
import { businessProfileInput, updateBusinessProfile } from "@/server/provider-account";
import { localEncryptedStore } from "@/server/storage/local-encrypted";

const str = (f: FormData, k: string) => (typeof f.get(k) === "string" ? (f.get(k) as string) : "");

/**
 * Saves the About card. This is a plain form post, so errors and what was
 * typed come back through the query string and render inline on the page.
 */
export async function saveBusinessProfile(formData: FormData): Promise<void> {
  const { user } = await requireProviderKind("studio", "/business/profile");
  const values = { businessName: str(formData, "businessName"), bio: str(formData, "bio"), sinceYear: str(formData, "sinceYear") };
  const parsed = businessProfileInput().safeParse(values);
  const back = (extra: Record<string, string>) => redirect(`/business/profile?${new URLSearchParams({ ...extra }).toString()}`);
  const typed = { vn: values.businessName.slice(0, 200), vb: values.bio.slice(0, 1000), vy: values.sinceYear.slice(0, 8) };
  if (!parsed.success) {
    const e: Record<string, string> = {};
    const keys: Record<string, string> = { businessName: "en", bio: "eb", sinceYear: "ey" };
    for (const i of parsed.error.issues) {
      const k = keys[String(i.path[0])];
      if (k && !e[k]) e[k] = i.message;
    }
    back({ ...typed, ...e });
  }
  try {
    await updateBusinessProfile(db(), user.id, values);
  } catch {
    back({ ...typed, ef: "We could not save this. Try again." });
  }
  revalidatePath("/business/profile");
  back({ saved: "1" });
}

/** Removes one of the caller's own items; the id is checked against the owner in removeItem. */
export async function removePortfolioItem(formData: FormData): Promise<void> {
  const { user } = await requireProviderKind("studio", "/business/profile");
  const id = str(formData, "id");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  try {
    await removeItem({ db: db(), store: localEncryptedStore(env().DOCUMENT_DIR, env().DOCUMENT_KEY) }, { id: user.id, role: user.role }, id);
  } catch (e) {
    if (!(e instanceof PortfolioError)) throw e;
  }
  revalidatePath("/business/profile");
}
