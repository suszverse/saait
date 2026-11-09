import type { Metadata } from "next";
import { connection } from "next/server";
import { CheckIcon, StatusChip } from "@/components/ui";
import { formatRs, paisa } from "@/lib/money";
import { bsDayMonth } from "@/lib/nepali-date";
import { requireProviderKind } from "@/server/auth/guards";
import { providerToday } from "@/server/provider-account";

export const metadata: Metadata = { title: "Today" };

const PLAN_LABEL = { free: "Freelancer", pro: "Business", studio: "Studio" } as const;

/** Business home (Figma B1): today's bookings for a studio. */
export default async function BusinessHome() {
  await connection();
  const { profile: p } = await requireProviderKind("studio", "/business");
  const t = await providerToday(p.id, p.dailyCapacity);
  const verified = p.kycStatus === "verified";

  return (
    <main className="mx-auto flex w-full max-w-page flex-1 flex-col gap-5 px-gutter pt-6 pb-8 md:px-gutter-desktop md:pt-10">
      <header className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-profile font-extrabold">Today, {bsDayMonth(t.today)}</h1>
          <p className="text-small text-stone">
            {p.displayName} · {PLAN_LABEL[p.plan]} plan · {verified ? "verified" : "verification pending"}
          </p>
        </div>
        {verified ? (
          <span className="inline-flex h-7 items-center gap-1.5 rounded-chip bg-tint px-2.5 text-micro font-bold">
            <CheckIcon size={12} strokeWidth={3} className="text-teal" />
            Verified
          </span>
        ) : (
          <StatusChip type="under_review">Not public yet</StatusChip>
        )}
      </header>

      <section className="flex flex-col gap-2.5" aria-labelledby="booked">
        <h2 id="booked" className="text-heading font-bold">
          Booked today
        </h2>
        {t.booked.length === 0 ? (
          <p className="rounded-card bg-tint px-4 py-3.5 text-small">Nothing booked today. Your bookings appear here.</p>
        ) : (
          t.booked.map((b) => (
            <article key={b.id} className="flex flex-col gap-1.5 rounded-card border border-line px-4 py-3.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-body font-bold">
                  {b.code} · {b.packageName}
                </span>
                <span className="text-small font-semibold">{formatRs(paisa(b.agreedTotal))}</span>
              </div>
              <p className="text-small text-stone">{b.venue}</p>
              <p className="text-meta text-stone">
                Deposit {formatRs(paisa(b.depositAmount))} held · balance {formatRs(paisa(b.balanceDue))} paid to you directly
              </p>
            </article>
          ))
        )}
      </section>
    </main>
  );
}
