"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireProviderKind } from "@/server/auth/guards";
import { CrewError, hire } from "@/server/crew/jobs";
import { db } from "@/server/db";

const form = z.object({
  alias: z.string().min(1).max(40),
  freelancerProfileId: z.string().uuid(),
  day: z.string().min(1),
  role: z.string().trim().min(1, "Pick a role.").max(40),
  rupees: z.coerce.number().min(0, "Enter a day rate."),
  lat: z.string().max(20).optional(),
  lng: z.string().max(20).optional(),
});

/**
 * Sends the offer. Success returns to the list with a notice (the freelancer
 * is no longer open that day, so their profile would 404); a CrewError goes
 * back to the profile with the message shown inline.
 */
export async function hireCrew(formData: FormData): Promise<void> {
  const raw = Object.fromEntries(formData);
  const parsed = form.safeParse(raw);
  const alias = typeof raw.alias === "string" ? raw.alias : "";
  const here = (extra: Record<string, string>) => {
    const p = new URLSearchParams(extra);
    for (const k of ["day", "lat", "lng"] as const) {
      const v = raw[k];
      if (typeof v === "string" && v && !p.has(k)) p.set(k, v);
    }
    return p.toString();
  };
  const profile = `/business/crew/${encodeURIComponent(alias)}`;
  const { user } = await requireProviderKind("studio", profile);

  if (!parsed.success) redirect(`${profile}?${here({ error: parsed.error.issues[0]?.message ?? "Please check the form." })}`);
  const f = parsed.data;

  let failure: string | null = null;
  try {
    await hire(db(), user.id, {
      freelancerProfileId: f.freelancerProfileId,
      day: f.day,
      role: f.role,
      dayRatePaisa: Math.round(f.rupees * 100),
    });
  } catch (e) {
    if (e instanceof CrewError) failure = e.message;
    else throw e;
  }
  // redirect() throws, so it stays outside the try block.
  if (failure) redirect(`${profile}?${here({ error: failure })}`);
  redirect(`/business/crew?${here({ sent: "1" })}`);
}
