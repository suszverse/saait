import type { Metadata } from "next";
import { connection } from "next/server";
import { Button } from "@/components/ui/button";
import { formatRs, paisa } from "@/lib/money";
import { bsDayMonthNp, bsLongWithGregorian, todayInNepal } from "@/lib/nepali-date";
import { requireProviderKind } from "@/server/auth/guards";
import { jobsForFreelancer } from "@/server/crew/jobs";
import { db } from "@/server/db";
import { respondToOffer } from "./actions";

export const metadata: Metadata = { title: "Jobs" };

type Row = Awaited<ReturnType<typeof jobsForFreelancer>>[number];

function JobCard({ row, primary, offer }: { row: Row; primary: boolean; offer: boolean }) {
  const { job, businessName } = row;
  return (
    <li className="flex flex-col gap-3 rounded-card border border-line bg-ground p-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-body font-bold">{businessName}</h3>
        <p className="text-label">
          <span lang="ne">{bsDayMonthNp(job.day)}</span> · {job.role}
        </p>
        <p className="text-small text-stone">{bsLongWithGregorian(job.day)}</p>
        <p className="text-label font-semibold">{formatRs(paisa(job.dayRate))} for the day · paid to you directly</p>
      </div>
      {offer ? (
        <form action={respondToOffer} className="flex flex-wrap gap-2">
          <input type="hidden" name="jobId" value={job.id} />
          <input type="hidden" name="from" value="/crew/jobs" />
          <Button type="submit" name="decision" value="accept" variant={primary ? "primary" : "secondary"} size="md">
            Accept
          </Button>
          <Button type="submit" name="decision" value="decline" variant="tertiary" size="md">
            Decline
          </Button>
        </form>
      ) : (
        <p className="text-small font-semibold text-teal">Accepted</p>
      )}
    </li>
  );
}

/** Crew job offers (Figma F1): offered jobs to answer, accepted jobs coming up. */
export default async function CrewJobs({ searchParams }: PageProps<"/crew/jobs">) {
  await connection();
  const { user } = await requireProviderKind("freelancer", "/crew/jobs");
  const sp = await searchParams;
  const error = typeof sp.error === "string" ? sp.error : null;

  const today = todayInNepal();
  const rows = (await jobsForFreelancer(db(), user.id)).slice().reverse(); // soonest day first
  const offers = rows.filter((r) => r.job.status === "offered" && r.job.day >= today);
  const upcoming = rows.filter((r) => r.job.status === "accepted" && r.job.day >= today);

  return (
    <main className="mx-auto flex w-full max-w-page flex-1 flex-col gap-6 px-gutter pt-6 pb-8 md:px-gutter-desktop md:pt-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-profile font-extrabold">Jobs</h1>
      </header>

      {error && (
        <p role="alert" className="rounded-card border border-sindoor px-4 py-3 text-small text-sindoor">
          {error}
        </p>
      )}

      <section className="flex flex-col gap-2.5" aria-labelledby="waiting">
        <h2 id="waiting" className="text-heading font-bold">
          Waiting for you
        </h2>
        {offers.length === 0 ? (
          <p className="rounded-card bg-tint px-4 py-3.5 text-small">No offers yet. Businesses near you will find you by your work and record.</p>
        ) : (
          <>
            <ul className="flex flex-col gap-3">
              {offers.map((r, i) => (
                <JobCard key={r.job.id} row={r} primary={i === 0} offer />
              ))}
            </ul>
            <p className="text-small text-stone">Your name and number are shared with the business when you accept.</p>
          </>
        )}
      </section>

      <section className="flex flex-col gap-2.5" aria-labelledby="coming">
        <h2 id="coming" className="text-heading font-bold">
          Coming up
        </h2>
        {upcoming.length === 0 ? (
          <p className="rounded-card bg-tint px-4 py-3.5 text-small">Jobs you accept show up here.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {upcoming.map((r) => (
              <JobCard key={r.job.id} row={r} primary={false} offer={false} />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
