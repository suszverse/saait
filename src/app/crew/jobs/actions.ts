"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireProviderKind } from "@/server/auth/guards";
import { CrewError, respond } from "@/server/crew/jobs";
import { db } from "@/server/db";

const form = z.object({
  jobId: z.string().uuid(),
  decision: z.enum(["accept", "decline"]),
  from: z.enum(["/crew", "/crew/jobs"]).catch("/crew/jobs"),
});

/**
 * Accepts or declines an offer. A CrewError goes back to the page it came
 * from with the message shown inline; success revalidates both crew pages.
 */
export async function respondToOffer(formData: FormData): Promise<void> {
  const parsed = form.safeParse(Object.fromEntries(formData));
  const from = parsed.success ? parsed.data.from : "/crew/jobs";
  const { user } = await requireProviderKind("freelancer", from);
  if (!parsed.success) redirect(`${from}?error=${encodeURIComponent("Please try again.")}`);

  try {
    await respond(db(), user.id, parsed.data.jobId, parsed.data.decision);
  } catch (e) {
    if (e instanceof CrewError) redirect(`${from}?error=${encodeURIComponent(e.message)}`);
    throw e;
  }
  revalidatePath("/crew");
  revalidatePath("/crew/jobs");
  redirect(from);
}
