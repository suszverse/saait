import { CREW_ROLES } from "@/server/provider-account";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { CrewAvatar } from "@/components/crew/crew-card";
import { Button } from "@/components/ui";
import { LevelBadge } from "@/components/ui/level-badge";
import { formatRs, paisa } from "@/lib/money";
import { bsLongWithGregorian, isIsoDate, todayInNepal } from "@/lib/nepali-date";
import { requireProviderKind } from "@/server/auth/guards";
import { findCrew } from "@/server/crew/jobs";
import { db } from "@/server/db";
import { hireCrew } from "../actions";

export const metadata: Metadata = { title: "Crew profile" };

/** Fallback point when the business has not set a location. */
const KATHMANDU = { lat: 27.7172, lng: 85.324 };
const field = "h-13 w-full min-w-0 rounded-button border border-line bg-ground px-3.5 text-body outline-none focus:border-ink focus:ring-1 focus:ring-inset focus:ring-ink";
type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const num = (v: string | undefined, fallback: number) => {
  const n = v === undefined || v.trim() === "" ? NaN : Number(v);
  return Number.isFinite(n) ? n : fallback;
};

/** Freelancer profile as a business sees it (Figma P2): the record, never the person. */
export default async function CrewProfile({ params, searchParams }: { params: Promise<{ alias: string }>; searchParams: Promise<Search> }) {
  await connection();
  const [{ alias: raw }, sp] = await Promise.all([params, searchParams]);
  const alias = decodeURIComponent(raw);
  const { user, profile } = await requireProviderKind("studio", `/business/crew/${raw}`);

  const dayRaw = one(sp.day);
  const day = dayRaw && isIsoDate(dayRaw) ? dayRaw : todayInNepal();
  const lat = num(one(sp.lat), profile.lat ?? KATHMANDU.lat);
  const lng = num(one(sp.lng), profile.lng ?? KATHMANDU.lng);

  let crew: Awaited<ReturnType<typeof findCrew>> = [];
  try {
    crew = await findCrew(db(), user.id, { day, lat, lng });
  } catch {
    notFound();
  }
  const c = crew.find((m) => m.alias === alias);
  if (!c) notFound();

  const error = one(sp.error);
  const back = new URLSearchParams({ day, lat: String(lat), lng: String(lng) }).toString();

  return (
    <main className="mx-auto flex w-full max-w-page flex-1 flex-col gap-5 px-gutter pt-6 pb-8 md:px-gutter-desktop md:pt-10">
      <Link href={`/business/crew?${back}`} className="text-small font-semibold underline underline-offset-2">
        Back to crew
      </Link>

      <header className="flex items-center gap-4">
        <CrewAvatar alias={c.alias} size={64} />
        <div className="flex min-w-0 flex-col gap-1.5">
          <h1 className="text-title font-extrabold">{c.alias}</h1>
          <span>
            <LevelBadge level={c.level} />
          </span>
          <p className="text-small text-stone">Reliability {c.reliability}</p>
        </div>
      </header>

      <section aria-labelledby="private" className="flex flex-col gap-1 rounded-card bg-tint px-4 py-3.5">
        <h2 id="private" className="text-small font-bold">
          Name and number shared when you hire
        </h2>
        <p className="text-small">You see the work and the record on Saait. Name, face and number appear once you hire through Saait.</p>
      </section>

      {c.headline ? <p className="text-body">{c.headline}</p> : null}

      <section aria-labelledby="skills" className="flex flex-col gap-2">
        <h2 id="skills" className="text-heading font-bold">
          Skills
        </h2>
        <ul className="flex flex-wrap gap-1.5">
          {c.roles.map((r) => (
            <li key={r} className="inline-flex h-8 items-center rounded-chip bg-tint px-3 text-small font-semibold">
              {r}
            </li>
          ))}
        </ul>
      </section>

      <dl className="flex flex-col gap-1 rounded-card border border-line px-4 py-3.5">
        <dt className="text-meta text-stone">Day rate</dt>
        <dd className="text-heading font-bold">
          {c.dayRate !== null ? `${formatRs(paisa(c.dayRate))} a day` : "Agreed when you hire"}
          <span className="block text-meta font-normal text-stone">Paid by you directly</span>
        </dd>
      </dl>

      <form action={hireCrew} className="flex flex-col gap-4 rounded-card border border-line p-4" aria-labelledby="hire-h">
        <h2 id="hire-h" className="text-heading font-bold">
          Hire {c.alias}
        </h2>
        <input type="hidden" name="alias" value={c.alias} />
        <input type="hidden" name="freelancerProfileId" value={c.profileId} />
        <input type="hidden" name="lat" value={lat} />
        <input type="hidden" name="lng" value={lng} />
        <div className="grid gap-3 md:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="day" className="text-small font-semibold">Day</label>
            <input id="day" name="day" type="date" min={todayInNepal()} defaultValue={day} required className={field} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="role" className="text-small font-semibold">Role</label>
            <select id="role" name="role" defaultValue={(c.roles.length ? c.roles : CREW_ROLES)[0]} required className={field}>
              {(c.roles.length ? c.roles : CREW_ROLES).map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="rupees" className="text-small font-semibold">Day rate (Rs)</label>
            <input id="rupees" name="rupees" type="number" inputMode="decimal" min={0} step="any" required defaultValue={c.dayRate !== null ? c.dayRate / 100 : undefined} className={field} />
          </div>
        </div>
        {error ? (
          <p role="alert" className="text-small text-sindoor">
            {error}
          </p>
        ) : null}
        <Button type="submit" variant="primary">
          Hire for {bsLongWithGregorian(day)}
        </Button>
        <p className="text-meta text-stone">Messages stay on Saait and are checked before delivery.</p>
      </form>
    </main>
  );
}
