"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { env } from "@/env";
import { requireProviderKind } from "@/server/auth/guards";
import { db } from "@/server/db";
import { PortfolioError, removeItem } from "@/server/portfolio";
import { updateCrewProfile } from "@/server/provider-account";
import { localEncryptedStore } from "@/server/storage/local-encrypted";

const str = (f: FormData, k: string) => (typeof f.get(k) === "string" ? (f.get(k) as string) : "");

/**
 * Saves the private crew profile. A plain form post: errors and what was typed
 * come back through the query string and render inline on the page.
 */
export async function saveCrewProfile(formData: FormData): Promise<void> {
  const { user } = await requireProviderKind("freelancer", "/crew/profile");
  const roles = formData.getAll("roles").filter((r): r is string => typeof r === "string");
  const values = { headline: str(formData, "headline"), bio: str(formData, "bio"), dayRate: str(formData, "dayRate"), roles };
  const back = (extra: Record<string, string>) => redirect(`/crew/profile?${new URLSearchParams(extra).toString()}`);
  const typed = { vh: values.headline.slice(0, 300), vb: values.bio.slice(0, 1000), vd: values.dayRate.slice(0, 12), vr: roles.join(",").slice(0, 200), t: "1" };
  const keys: Record<string, string> = { headline: "eh", bio: "eb", dayRate: "ed", roles: "er" };
  try {
    await updateCrewProfile(db(), user.id, values);
  } catch (e) {
    if (e instanceof z.ZodError) {
      const errs: Record<string, string> = {};
      for (const i of e.issues) {
        const k = keys[String(i.path[0])];
        if (k && !errs[k]) errs[k] = i.message;
      }
      back({ ...typed, ...errs });
    }
    back({ ...typed, ef: "We could not save this. Try again." });
  }
  revalidatePath("/crew/profile");
  back({ saved: "1" });
}

/** Removes one of the caller's own items; the id is checked against the owner in removeItem. */
export async function removePortfolioItem(formData: FormData): Promise<void> {
  const { user } = await requireProviderKind("freelancer", "/crew/profile");
  const id = str(formData, "id");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  try {
    await removeItem({ db: db(), store: localEncryptedStore(env().DOCUMENT_DIR, env().DOCUMENT_KEY) }, { id: user.id, role: user.role }, id);
  } catch (e) {
    if (!(e instanceof PortfolioError)) throw e;
  }
  revalidatePath("/crew/profile");
}
