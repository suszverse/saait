"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth/guards";
import { db } from "@/server/db";
import { providerForUser } from "@/server/provider-account";
import { RewardError } from "@/server/rewards/ledger";
import { RedeemError, redeemPlanMonth } from "@/server/rewards/redeem";
import type { RedeemOutcome } from "./outcomes";


/**
 * Spends PLAN_MONTH_POINTS on one month of Business for the signed-in
 * provider. Posted from a plain form so it works without client JS; the
 * result comes back as a query code the page renders inline. `redirect`
 * throws, so it runs outside the try that catches the domain errors.
 */
export async function redeemAction(): Promise<void> {
  const user = await requireUser("/rewards");
  const profile = await providerForUser(user.id);
  if (!profile) redirect("/rewards?redeem=not_found");

  let outcome: RedeemOutcome;
  let until: string | undefined;
  try {
    const r = await redeemPlanMonth(db(), profile.id);
    outcome = "ok";
    until = r.periodEnd;
  } catch (e) {
    if (e instanceof RedeemError) outcome = e.code;
    else if (e instanceof RewardError && e.code === "points_frozen") outcome = "points_frozen";
    else throw e;
  }

  revalidatePath("/rewards");
  const params = new URLSearchParams({ redeem: outcome });
  if (until) params.set("until", until);
  redirect(`/rewards?${params}`);
}
