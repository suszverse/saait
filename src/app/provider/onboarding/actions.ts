"use server";

import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { requireUser } from "@/server/auth/guards";
import { getSession } from "@/server/auth/session";
import { db } from "@/server/db";
import { createProviderProfile, ProviderAccountError } from "@/server/provider-account";

export type OnboardingState = { error?: string };

export async function startOnboarding(_prev: OnboardingState, form: FormData): Promise<OnboardingState> {
  const user = await requireUser("/provider/onboarding");
  const kind = form.get("kind") ?? undefined;
  try {
    await createProviderProfile(
      db(),
      user,
      kind === "studio"
        ? {
            kind,
            fullName: form.get("fullName") ?? undefined,
            businessName: form.get("businessName") ?? undefined,
            displayName: form.get("displayName") ?? undefined,
            city: form.get("city") ?? undefined,
            categories: form.getAll("categories"),
          }
        : {
            kind,
            fullName: form.get("fullName") ?? undefined,
            headline: form.get("headline") ?? undefined,
            roles: form.getAll("roles"),
            dayRate: form.get("dayRate") || undefined,
            bio: form.get("bio") || undefined,
            city: form.get("city") ?? undefined,
          },
    );
  } catch (e) {
    if (e instanceof ZodError) return { error: e.issues[0].message };
    if (e instanceof ProviderAccountError) return { error: e.message };
    throw e;
  }
  const session = await getSession();
  if (user.role === "client") {
    session.role = "provider";
    await session.save();
  }
  redirect("/provider/kyc");
}
