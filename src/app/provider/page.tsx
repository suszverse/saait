import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { BottomNav, ButtonLink, CheckIcon, SaaitDot, StatusChip } from "@/components/ui";
import { formatRs, paisa } from "@/lib/money";
import { bsDayMonth } from "@/lib/nepali-date";
import { signOut } from "@/app/login/actions";
import { requireUser } from "@/server/auth/guards";
import { providerForUser, providerToday } from "@/server/provider-account";

export const metadata: Metadata = { title: "Today" };

/**
 * Provider home (Figma screen 6) without the Phase 2 parts: the urgent job
 * alert and featured slots arrive with the dispatch engine and billing.
 */
export default async function ProviderHome() {
  await connection();
  const user = await requireUser("/provider");
  if (user.role === "operator" || user.role === "admin") notFound();
  const p = await providerForUser(user.id);
  // A signed-in client who opens /provider is starting to list their work.
  if (!p) redirect("/provider/onboarding");
  const t = await providerToday(p.id, p.dailyCapacity);
  const verified = p.kycStatus === "verified";

  return (
    <>
      <main className="mx-auto flex w-full max-w-page flex-1 flex-col gap-5 px-gutter pt-14 pb-8 md:px-gutter-desktop md:pt-10">
        <header className="flex items-center justify-between gap-3">
          <div className="flex flex-col">
            <p className="text-small text-stone">{p.displayName}</p>
            <h1 className="text-profile font-extrabold">Today, {bsDayMonth(t.today)}</h1>
          </div>
          {verified ? (
            <span className="inline-flex h-7 items-center gap-1.5 rounded-chip bg-tint px-2.5 text-micro font-bold">
              <CheckIcon size={12} strokeWidth={3} className="text-teal" />
              {p.plan === "free" ? "Free" : p.plan === "pro" ? "Pro" : "Studio"} · verified
            </span>
          ) : (
            <StatusChip type="under_review">Not public yet</StatusChip>
          )}
        </header>

        {!verified && (
          <section className="flex flex-col gap-3 rounded-card border border-line px-4 py-3.5">
            <p className="text-body font-bold">Get verified to go live</p>
            <p className="text-small text-stone">Clients only see providers our team has checked. Add your ID, PAN and payout account; it takes about five minutes.</p>
            <ButtonLink href="/provider/kyc" variant="secondary">
              {p.kycStatus === "registered" || p.kycStatus === "rejected" || p.kycStatus === "reverification_due" ? "Continue verification" : "See verification status"}
            </ButtonLink>
          </section>
        )}

        <section className="flex flex-col gap-2.5" aria-labelledby="booked">
          <h2 id="booked" className="text-heading font-bold">
            Booked today
          </h2>
          {t.booked.length === 0 ? (
            <p className="rounded-card bg-tint px-4 py-3.5 text-small">Nothing booked today.</p>
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

        <section className="flex flex-col gap-2.5" aria-labelledby="dates">
          <h2 id="dates" className="text-heading font-bold">
            Next wedding dates
          </h2>
          <ul className="grid grid-cols-4 gap-2 md:max-w-[560px]">
            {t.dates.map((d) => (
              <li key={d.day} className="flex flex-col items-center gap-1 rounded-control border border-line px-2 py-2.5">
                <span className="flex items-center gap-1 text-meta font-bold">
                  <SaaitDot />
                  {bsDayMonth(d.day)}
                </span>
                <span className={`text-micro ${d.left === 0 ? "text-sindoor" : d.left === 1 ? "text-marigold-text" : "text-teal"}`}>
                  {d.left === 0 ? "Full" : d.left === 1 ? "1 slot left" : `${d.left} open`}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <form action={signOut}>
          <button type="submit" className="text-small font-semibold text-stone underline">
            Sign out
          </button>
        </form>
        <p className="text-meta text-stone">
          Phone {user.phone.replace("+977", "")} · <Link href="/provider/kyc">Account and verification</Link>
        </p>
      </main>
      <BottomNav role="provider" active="today" />
    </>
  );
}
