"use server";

import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { requireUser } from "@/server/auth/guards";
import { getSession } from "@/server/auth/session";
import { createProviderProfile } from "@/server/provider-account";

export type OnboardingState = { error?: string };

export async function startOnboarding(_prev: OnboardingState, form: FormData): Promise<OnboardingState> {
  const user = await requireUser("/provider/onboarding");
  try {
    await createProviderProfile(user, {
      fullName: form.get("fullName") ?? undefined,
      displayName: form.get("displayName") ?? undefined,
      kind: form.get("kind") ?? undefined,
      city: form.get("city") ?? undefined,
      categories: form.getAll("categories"),
    });
  } catch (e) {
    if (e instanceof ZodError) return { error: e.issues[0].message };
    throw e;
  }
  const session = await getSession();
  if (user.role === "client") {
    session.role = "provider";
    await session.save();
  }
  redirect("/provider/kyc");
}
