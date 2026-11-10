import type { Metadata } from "next";
import { connection } from "next/server";
import { CrewCard } from "@/components/crew/crew-card";
import { Button, FilterChipLink } from "@/components/ui";
import { bsLongWithGregorian, isIsoDate, todayInNepal } from "@/lib/nepali-date";
import { requireProviderKind } from "@/server/auth/guards";
import { findCrew } from "@/server/crew/jobs";
import { db } from "@/server/db";

export const metadata: Metadata = { title: "Find crew" };

const ROLES = ["Photographer", "Videographer", "Editor", "Assistant", "Drone pilot"];
/** Fallback point when the business has not set a location. */
const KATHMANDU = { lat: 27.7172, lng: 85.324 };
const field = "h-13 w-full min-w-0 rounded-button border border-line bg-ground px-3.5 text-body outline-none focus:border-ink focus:ring-1 focus:ring-inset focus:ring-ink";

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const num = (v: string | undefined, fallback: number) => {
  const n = v === undefined || v.trim() === "" ? NaN : Number(v);
  return Number.isFinite(n) ? n : fallback;
};

/** Business find-crew (Figma B2): who is free on a day, near a point. */
export default async function FindCrew({ searchParams }: { searchParams: Promise<Search> }) {
  await connection();
  const sp = await searchParams;
  const { user, profile } = await requireProviderKind("studio", "/business/crew");

  const today = todayInNepal();
  const dayRaw = one(sp.day);
  const day = dayRaw && isIsoDate(dayRaw) ? dayRaw : today;
  const lat = num(one(sp.lat), profile.lat ?? KATHMANDU.lat);
  const lng = num(one(sp.lng), profile.lng ?? KATHMANDU.lng);
  const role = ROLES.find((r) => r === one(sp.role));

  let crew: Awaited<ReturnType<typeof findCrew>> = [];
  let problem: string | null = null;
  try {
    crew = await findCrew(db(), user.id, { day, lat, lng, role });
  } catch {
    problem = "Check the date and the point, then try again.";
  }

  const carry = new URLSearchParams({ day, lat: String(lat), lng: String(lng) });
  const chipHref = (r?: string) => {
    const p = new URLSearchParams(carry);
    if (r) p.set("role", r);
    return `/business/crew?${p.toString()}`;
  };
  const profileHref = (alias: string) => {
    const p = new URLSearchParams(carry);
    return `/business/crew/${encodeURIComponent(alias)}?${p.toString()}`;
  };

  return (
    <main className="mx-auto flex w-full max-w-page flex-1 flex-col gap-5 px-gutter pt-6 pb-8 md:px-gutter-desktop md:pt-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-profile font-extrabold">Find crew</h1>
        <p className="text-small text-stone">Verified crew free on {bsLongWithGregorian(day)}. Names stay private until you hire.</p>
      </header>

      {one(sp.sent) ? (
        <p role="status" className="rounded-card bg-teal-tint px-4 py-3.5 text-small font-semibold text-teal">
          Offer sent. You will see their name and number once they accept.
        </p>
      ) : null}

      <form method="get" action="/business/crew" className="flex flex-col gap-4 rounded-card border border-line p-4">
        {role ? <input type="hidden" name="role" value={role} /> : null}
        <div className="grid gap-3 md:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="day" className="text-small font-semibold">Date</label>
            <input id="day" name="day" type="date" min={today} defaultValue={day} className={field} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="lat" className="text-small font-semibold">Near latitude</label>
            <input id="lat" name="lat" type="number" step="any" min={-90} max={90} defaultValue={lat} className={field} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="lng" className="text-small font-semibold">Near longitude</label>
            <input id="lng" name="lng" type="number" step="any" min={-180} max={180} defaultValue={lng} className={field} />
          </div>
        </div>
        <p className="text-meta text-stone">The point starts at your business location.</p>
        <div>
          <Button type="submit" variant="secondary" size="md">
            Show crew
          </Button>
        </div>
      </form>

      <nav aria-label="Role" className="flex gap-2 overflow-x-auto pb-1">
        <FilterChipLink href={chipHref()} selected={!role}>
          All roles
        </FilterChipLink>
        {ROLES.map((r) => (
          <FilterChipLink key={r} href={chipHref(r)} selected={r === role}>
            {r}
          </FilterChipLink>
        ))}
      </nav>

      {problem ? (
        <p role="alert" className="text-small text-sindoor">
          {problem}
        </p>
      ) : crew.length === 0 ? (
        <p className="rounded-card bg-tint px-4 py-3.5 text-small">No crew free on this day near this point. Try another date or role.</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-3" aria-label="Crew">
          {crew.map((c) => (
            <li key={c.profileId} className="flex">
              <div className="flex w-full flex-col [&>a]:flex-1">
                <CrewCard crew={c} href={profileHref(c.alias)} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
