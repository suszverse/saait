"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { acceptAgreement, AgreementError } from "@/server/agreement";
import { requireUser } from "@/server/auth/guards";
import { db } from "@/server/db";
import type { JoinKind } from "./agree-form";

export type AgreeState = { error?: string };

/** Only same-site relative paths, so `next` cannot send anyone off-site. */
const nextPath = z
  .string()
  .regex(/^\/(?!\/)[\w\-/?=&%.+,]*$/)
  .optional()
  .catch(undefined);

const agreeInput = z.object({
  kind: z.enum(["client", "studio", "freelancer"] satisfies JoinKind[]),
  version: z.string().min(1).max(40),
  // A ticked checkbox posts "on"; anything else means the box was not ticked.
  accepted: z.literal("on", { error: "Tick the box to agree before you continue." }).transform(() => true as const),
  next: nextPath,
});

export async function agree(_prev: AgreeState, form: FormData): Promise<AgreeState> {
  const parsed = agreeInput.safeParse({
    kind: form.get("kind"),
    version: form.get("version"),
    accepted: form.get("accepted"),
    next: form.get("next") ?? undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { kind, version, accepted, next } = parsed.data;
  const user = await requireUser(`/join/agree?kind=${kind}`);
  try {
    await acceptAgreement(db(), user.id, { version, accepted });
  } catch (e) {
    if (e instanceof AgreementError) return { error: e.message };
    return { error: "Something went wrong on our side. Try again in a moment." };
  }
  if (next) redirect(next);
  redirect(kind === "client" ? "/" : `/provider/onboarding?kind=${kind}`);
}
