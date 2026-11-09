import type { Metadata } from "next";
import { connection } from "next/server";
import { requireProviderKind } from "@/server/auth/guards";

export const metadata: Metadata = { title: "Today" };

/** Crew home (Figma F1). Job offers arrive with the crew hiring task. */
export default async function CrewHome() {
  await connection();
  const { profile: p } = await requireProviderKind("freelancer", "/crew");

  return (
    <main className="mx-auto flex w-full max-w-page flex-1 flex-col gap-5 px-gutter pt-6 pb-8 md:px-gutter-desktop md:pt-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-profile font-extrabold">Today</h1>
        <p className="text-small text-stone">{p.alias ?? p.displayName} · Your name and number stay private until you are hired</p>
      </header>

      <section className="flex flex-col gap-2.5" aria-labelledby="offers">
        <h2 id="offers" className="text-heading font-bold">
          Job offers
        </h2>
        <p className="rounded-card bg-tint px-4 py-3.5 text-small">Job offers appear here.</p>
      </section>
    </main>
  );
}
