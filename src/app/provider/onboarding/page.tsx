import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { requireUser } from "@/server/auth/guards";
import { db } from "@/server/db";
import { CREW_ROLES, providerForUser } from "@/server/provider-account";
import { getCategories, getCities } from "@/server/providers";
import { OnboardingForm, type ProviderKind } from "./onboarding-form";

export const metadata: Metadata = { title: "List your work" };

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  await connection();
  // The join page links here with ?kind= already chosen; anything else starts as a freelancer.
  const { kind } = await searchParams;
  const initialKind: ProviderKind = kind === "studio" ? "studio" : "freelancer";
  const user = await requireUser("/provider/onboarding");
  if (await providerForUser(user.id)) redirect("/provider/kyc");
  if (user.role === "operator" || user.role === "admin") {
    return (
      <main className="mx-auto flex w-full max-w-form flex-1 flex-col gap-3 px-gutter pt-14 md:pt-10">
        <h1 className="text-title font-extrabold">This is an operator account</h1>
        <p className="text-small text-stone">Operator accounts cannot list as providers. Sign out and sign in with the provider&apos;s own number.</p>
      </main>
    );
  }
  const [cities, categories] = await Promise.all([getCities(db()), getCategories(db())]);
  return (
    <main className="mx-auto flex w-full max-w-form flex-1 flex-col gap-6 px-gutter pt-14 pb-10 md:pt-10">
      <div className="flex flex-col gap-1">
        <h1 className="text-title font-extrabold">List your work on Saait</h1>
        <p className="text-small text-stone">Fixed packages, a calendar, and deposits held for you. Clients see you once our team has checked your ID and PAN.</p>
      </div>
      <OnboardingForm cities={cities.map((c) => ({ slug: c.slug, name: c.name }))} categories={categories.map((c) => ({ slug: c.slug, shortName: c.shortName }))} roles={CREW_ROLES} initialKind={initialKind} />
    </main>
  );
}
