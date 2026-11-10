import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { buttonClass, Button } from "@/components/ui";
import { bsLongWithGregorian, todayInNepal } from "@/lib/nepali-date";
import { formatRs, paisa } from "@/lib/money";
import { requireProviderKind } from "@/server/auth/guards";
import { crewContact, jobsForBusiness } from "@/server/crew/jobs";
import { reviewedCrewJobIds } from "@/server/reviews";
import { db } from "@/server/db";
import { completeJob, noShowJob, reviewJob } from "./actions";

export const metadata: Metadata = { title: "Crew jobs" };

type Search = Record<string, string | string[] | undefined>;
type Row = Awaited<ReturnType<typeof jobsForBusiness>>[number];
type Contact = { name: string; phone: string } | null;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const field = "w-full min-w-0 rounded-button border border-line bg-ground px-3.5 py-3 text-body outline-none focus:border-ink focus:ring-1 focus:ring-inset focus:ring-ink";

const STATUS_LABEL: Record<string, string> = { offered: "Waiting for reply", accepted: "Accepted", completed: "Completed", no_show: "Did not show" };

/** Business crew jobs (Figma B3): offers out, accepted crew with contact, history. */
export default async function CrewJobs({ searchParams }: { searchParams: Promise<Search> }) {
  await connection();
  const sp = await searchParams;
  const { user } = await requireProviderKind("studio", "/business/crew/jobs");
  const today = todayInNepal();

  const all = await jobsForBusiness(db(), user.id);
  const offered = all.filter((r) => r.job.status === "offered");
  const accepted = all.filter((r) => r.job.status === "accepted");
  const history = all.filter((r) => r.job.status === "completed" || r.job.status === "no_show");
  const reviewed = await reviewedCrewJobIds(db(), user.id, history.filter((r) => r.job.status === "completed").map((r) => r.job.id));

  const contacts = new Map<string, Contact>();
  await Promise.all(
    [...accepted, ...history.filter((r) => r.job.status === "completed")].map(async (r) => {
      try {
        contacts.set(r.job.id, await crewContact(db(), user.id, r.job.id));
      } catch {
        contacts.set(r.job.id, null);
      }
    }),
  );

  const focus = one(sp.job);
  const error = one(sp.error);
  const done = one(sp.done);

  const card = (r: Row) => {
    const { job } = r;
    const contact = contacts.get(job.id) ?? null;
    const mine = focus === job.id;
    const canClose = job.status === "accepted" && job.day <= today;
    const label = contact ? contact.name : `${r.alias ?? ""}`.trim();
    return (
      <li key={job.id} className="flex flex-col gap-3 rounded-card border border-line p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex flex-col gap-0.5">
            <h3 className="text-body font-bold">{label}</h3>
            <p className="text-small text-stone">
              {job.role} · {formatRs(paisa(job.dayRate))} a day
            </p>
            <p className="text-small text-stone">{bsLongWithGregorian(job.day)}</p>
          </div>
          <span className="rounded-full bg-tint px-3 py-1 text-meta font-semibold">{STATUS_LABEL[job.status]}</span>
        </div>

        {job.status === "offered" ? <p className="text-small text-stone">Their name and number show here once they accept.</p> : null}

        {job.status === "accepted" && contact ? (
          <div className="flex flex-col gap-1 rounded-card bg-teal-tint px-4 py-3">
            <p className="text-small font-semibold text-teal">
              {contact.name} ·{" "}
              <a href={`tel:${contact.phone}`} className="underline underline-offset-2">
                {contact.phone}
              </a>
            </p>
            <p className="text-small">Pay {formatRs(paisa(job.dayRate))} directly to their verified account after the job.</p>
          </div>
        ) : null}

        {job.status === "completed" && contact ? (
          <p className="text-small">
            Phone: <a href={`tel:${contact.phone}`} className="font-semibold underline underline-offset-2">{contact.phone}</a>
          </p>
        ) : null}

        {job.status === "accepted" && !canClose ? <p className="text-small text-stone">You can mark this job done from its day onwards.</p> : null}

        {canClose ? (
          <div className="flex flex-wrap items-start gap-3">
            <form action={completeJob}>
              <input type="hidden" name="jobId" value={job.id} />
              <Button type="submit" variant="secondary" size="md">
                Completed
              </Button>
            </form>
            <details className="group">
              <summary className={`${buttonClass("tertiary", "md")} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>Didn&apos;t show</summary>
              <form action={noShowJob} className="mt-2 flex flex-col gap-2 rounded-card border border-line p-3">
                <input type="hidden" name="jobId" value={job.id} />
                <p className="text-small">Mark {label} as not showing up? This lowers their reliability and cannot be undone.</p>
                <div>
                  <Button type="submit" variant="tertiary" size="md">
                    Yes, they didn&apos;t show
                  </Button>
                </div>
              </form>
            </details>
          </div>
        ) : null}

        {job.status === "completed" ? (
          reviewed.has(job.id) || (mine && done === "reviewed") ? (
            <p role="status" className="rounded-card bg-teal-tint px-4 py-3 text-small font-semibold text-teal">
              Thanks — your review is saved.
            </p>
          ) : (
            <form action={reviewJob} className="flex flex-col gap-3 border-t border-line pt-3">
              <input type="hidden" name="jobId" value={job.id} />
              <fieldset className="flex flex-col gap-2">
                <legend className="text-small font-semibold">How did it go?</legend>
                <div className="flex flex-wrap gap-2">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <label key={n} className="relative">
                      <input type="radio" name="rating" value={n} required className="peer sr-only" />
                      <span className="flex h-11 min-w-11 cursor-pointer items-center justify-center gap-1 rounded-full border border-line px-3 text-small font-semibold peer-checked:border-ink peer-checked:bg-ink peer-checked:text-ground peer-focus-visible:ring-2 peer-focus-visible:ring-ink peer-focus-visible:ring-offset-2">
                        {n}
                        <span aria-hidden="true">★</span>
                        <span className="sr-only">{n === 1 ? "star" : "stars"}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="flex flex-col gap-1.5">
                <label htmlFor={`body-${job.id}`} className="text-small font-semibold">
                  Anything to add? <span className="font-normal text-stone">(optional)</span>
                </label>
                <textarea id={`body-${job.id}`} name="body" rows={3} maxLength={1000} className={field} />
              </div>
              <div>
                <Button type="submit" variant="secondary" size="md">
                  Save review
                </Button>
              </div>
            </form>
          )
        ) : null}

        {mine && error ? (
          <p role="alert" className="text-small text-sindoor">
            {error}
          </p>
        ) : null}
      </li>
    );
  };

  const section = (title: string, rows: Row[]) =>
    rows.length === 0 ? null : (
      <section aria-labelledby={`h-${title}`} className="flex flex-col gap-3">
        <h2 id={`h-${title}`} className="text-body font-extrabold">
          {title}
        </h2>
        <ul className="grid gap-3 md:grid-cols-2">{rows.map(card)}</ul>
      </section>
    );

  return (
    <main className="mx-auto flex w-full max-w-page flex-1 flex-col gap-6 px-gutter pt-6 pb-8 md:px-gutter-desktop md:pt-10">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-profile font-extrabold">Crew jobs</h1>
          <p className="text-small text-stone">Offers, accepted crew and past jobs.</p>
        </div>
        <Link href="/business/crew" className={buttonClass("secondary", "md")}>
          Find more crew
        </Link>
      </header>

      {error && !focus ? (
        <p role="alert" className="text-small text-sindoor">
          {error}
        </p>
      ) : null}
      {done === "completed" || done === "no_show" ? (
        <p role="status" className="rounded-card bg-tint px-4 py-3.5 text-small font-semibold">
          {done === "completed" ? "Marked as completed." : "Marked as not showing up."}
        </p>
      ) : null}

      {all.length === 0 ? (
        <p className="rounded-card bg-tint px-4 py-3.5 text-small">No crew hired yet.</p>
      ) : (
        <>
          {section("Offered", offered)}
          {section("Accepted", accepted)}
          {section("Completed and no-show", history)}
        </>
      )}
    </main>
  );
}
