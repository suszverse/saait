import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Button } from "@/components/ui/button";
import { formatRs, paisa } from "@/lib/money";
import { bsDayMonthNp, bsLongWithGregorian, todayInNepal } from "@/lib/nepali-date";
import { requireProviderKind } from "@/server/auth/guards";
import { jobsForFreelancer } from "@/server/crew/jobs";
import { db } from "@/server/db";
import { respondToOffer } from "./jobs/actions";

export const metadata: Metadata = { title: "Today" };

/** Crew home (Figma F1): the first pending offers, then a link to all jobs. */
export default async function CrewHome({ searchParams }: PageProps<"/crew">) {
  await connection();
  const { user, profile: p } = await requireProviderKind("freelancer", "/crew");
  const sp = await searchParams;
  const error = typeof sp.error === "string" ? sp.error : null;

  const today = todayInNepal();
  const offers = (await jobsForFreelancer(db(), user.id))
    .filter((r) => r.job.status === "offered" && r.job.day >= today)
    .reverse() // soonest day first
    .slice(0, 3);

  return (
    <main className="mx-auto flex w-full max-w-page flex-1 flex-col gap-5 px-gutter pt-6 pb-8 md:px-gutter-desktop md:pt-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-profile font-extrabold">Today</h1>
        <p className="text-small text-stone">{p.alias ?? p.displayName} · Your name and number stay private until you are hired</p>
      </header>

      {error && (
        <p role="alert" className="rounded-card border border-sindoor px-4 py-3 text-small text-sindoor">
          {error}
        </p>
      )}

      <section className="flex flex-col gap-2.5" aria-labelledby="offers">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="offers" className="text-heading font-bold">
            Offers
          </h2>
          <Link href="/crew/jobs" className="text-label font-semibold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
            All jobs
          </Link>
        </div>
        {offers.length === 0 ? (
          <p className="rounded-card bg-tint px-4 py-3.5 text-small">No offers yet. Businesses near you will find you by your work and record.</p>
        ) : (
          <>
            <ul className="flex flex-col gap-3">
              {offers.map(({ job, businessName }, i) => (
                <li key={job.id} className="flex flex-col gap-3 rounded-card border border-line bg-ground p-4">
                  <div className="flex flex-col gap-1">
                    <h3 className="text-body font-bold">{businessName}</h3>
                    <p className="text-label">
                      <span lang="ne">{bsDayMonthNp(job.day)}</span> · {job.role}
                    </p>
                    <p className="text-small text-stone">{bsLongWithGregorian(job.day)}</p>
                    <p className="text-label font-semibold">{formatRs(paisa(job.dayRate))} for the day · paid to you directly</p>
                  </div>
                  <form action={respondToOffer} className="flex flex-wrap gap-2">
                    <input type="hidden" name="jobId" value={job.id} />
                    <input type="hidden" name="from" value="/crew" />
                    <Button type="submit" name="decision" value="accept" variant={i === 0 ? "primary" : "secondary"} size="md">
                      Accept
                    </Button>
                    <Button type="submit" name="decision" value="decline" variant="tertiary" size="md">
                      Decline
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
            <p className="text-small text-stone">Your name and number are shared with the business when you accept.</p>
          </>
        )}
      </section>
    </main>
  );
}
