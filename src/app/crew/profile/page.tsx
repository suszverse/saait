import type { Metadata } from "next";
import { connection } from "next/server";
import { PortfolioGrid } from "@/components/portfolio/portfolio-grid";
import { Button, TextField } from "@/components/ui";
import { nextLevel } from "@/lib/levels";
import { limitsFor, nextLimits } from "@/lib/portfolio-limits";
import { requireProviderKind } from "@/server/auth/guards";
import { db } from "@/server/db";
import { listPortfolio } from "@/server/portfolio";
import { CREW_ROLES } from "@/server/provider-account";
import { listReviewsFor } from "@/server/reviews";
import { lifetimePoints, levelsFor } from "@/server/rewards/ledger";
import { FIVE_STAR_POINTS } from "@/server/rewards/earn";
import { removePortfolioItem, saveCrewProfile } from "./actions";

export const metadata: Metadata = { title: "Your profile and portfolio" };

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-card border border-line px-4 py-3">
      <dt className="text-meta text-stone">{label}</dt>
      <dd className="text-heading font-extrabold">{value}</dd>
    </div>
  );
}

/** Freelancer profile and portfolio editor (Figma P3). */
export default async function CrewProfile({ searchParams }: { searchParams: Promise<Search> }) {
  await connection();
  const sp = await searchParams;
  const { user, profile } = await requireProviderKind("freelancer", "/crew/profile");
  const d = db();
  const [levels, points] = await Promise.all([levelsFor(d, [user.id]), lifetimePoints(d, user.id)]);
  const level = levels.get(user.id) ?? "New";
  const input = { kind: "freelancer" as const, plan: profile.plan, level };
  const limits = limitsFor(input);
  const next = nextLimits(input);
  const nextName = nextLevel(points)?.name ?? null;
  const toGo = nextLevel(points);
  const [items, reviews] = await Promise.all([listPortfolio(d, profile.id, { id: user.id, role: user.role }), listReviewsFor(d, profile.id, { limit: 50 })]);

  const photos = items.filter((i) => i.mediaKind === "photo").length;
  const clips = items.filter((i) => i.mediaKind === "clip").length;
  const held = items.filter((i) => i.status === "held").length;
  const hint = (n: number | undefined) => (next && nextName && n != null ? ` · ${n} at ${nextName}` : "");

  const typed = one(sp.t) !== "";
  const roles = new Set(typed ? one(sp.vr).split(",").filter(Boolean) : (profile.crewRoles ?? []));
  const values = typed
    ? { headline: one(sp.vh), bio: one(sp.vb), dayRate: one(sp.vd) }
    : { headline: profile.crewHeadline ?? "", bio: profile.bio ?? "", dayRate: profile.dayRate ? String(Math.round(profile.dayRate / 100)) : "" };

  return (
    <main className="mx-auto flex w-full max-w-page flex-1 flex-col gap-6 px-gutter pt-6 pb-8 md:px-gutter-desktop md:pt-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-profile font-extrabold">Your profile and portfolio</h1>
        <p className="text-small text-stone">
          {profile.alias ?? profile.displayName} · {level} · businesses see your work and record; your name, face and number stay private until you are hired
        </p>
      </header>

      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Photos" value={`${photos} of ${limits.photos}${hint(next?.photos)}`} />
        <Stat label="Clips" value={`${clips} of ${limits.clips}${hint(next?.clips)}`} />
        <Stat label="Reviews from businesses" value={String(profile.ratingCount || reviews.length)} />
        <Stat label="Level" value={toGo ? `${toGo.pointsToGo} points to ${toGo.name}` : "Top level"} />
      </dl>

      <div className="grid gap-8 md:grid-cols-[1fr_360px]">
        <div className="flex min-w-0 flex-col gap-8">
          <PortfolioGrid items={items} limit={limits.photos} nextLimit={next?.photos} kind="photo" label="Photos" removeAction={removePortfolioItem} />
          <PortfolioGrid items={items} limit={limits.clips} nextLimit={next?.clips} kind="clip" label="Clips" removeAction={removePortfolioItem} />
        </div>

        <aside className="flex flex-col gap-4">
          <section aria-labelledby="privacy" className="flex flex-col gap-2 rounded-card bg-tint p-4">
            <h2 id="privacy" className="text-label font-extrabold">Privacy check</h2>
            <ul className="flex flex-col gap-1 text-small">
              <li><span aria-hidden className="text-teal">✓ </span>Face blurred in every photo and clip</li>
              <li><span aria-hidden className="text-teal">✓ </span>No names or numbers in watermarks</li>
            </ul>
            <p className="text-meta text-stone">
              {held > 0
                ? `${held} ${held === 1 ? "item is" : "items are"} held, with the reason on its tile. Replace it with a clean file and it goes live.`
                : "Every upload is checked before businesses see it. If one is held, the reason shows on its tile."}
            </p>
          </section>

          <form action={saveCrewProfile} className="flex flex-col gap-4">
            {one(sp.saved) ? <p role="status" className="rounded-control bg-teal-tint px-3 py-2 text-small font-semibold text-teal">Saved.</p> : null}
            {one(sp.ef) ? <p role="alert" className="text-small text-sindoor">{one(sp.ef)}</p> : null}

            <div className="flex flex-col gap-4 rounded-card border border-line p-4">
              <h2 className="text-label font-extrabold">Private crew profile</h2>
              <TextField id="headline" name="headline" label="Headline" defaultValue={values.headline} error={one(sp.eh) || undefined} required maxLength={120} />
              <TextField id="bio" name="bio" label="About your work" multiline rows={4} defaultValue={values.bio} error={one(sp.eb) || undefined} helper="Up to 600 characters. No names, numbers or links." maxLength={600} />
            </div>

            <div className="flex flex-col gap-4 rounded-card border border-line p-4">
              <h2 className="text-label font-extrabold">Day rate</h2>
              <TextField
                id="dayRate"
                name="dayRate"
                label="Rate per day (Rs)"
                type="number"
                inputMode="numeric"
                min={1000}
                max={100000}
                step={1}
                defaultValue={values.dayRate}
                error={one(sp.ed) || undefined}
                required
                helper="Businesses pay you directly to the account Saait verified. Saait takes nothing from it; your account stays free."
              />
            </div>

            <fieldset className="flex flex-col gap-3 rounded-card border border-line p-4" aria-describedby={one(sp.er) ? "roles-error" : undefined}>
              <legend className="px-1 text-label font-extrabold">Skills</legend>
              <div className="flex flex-wrap gap-2">
                {CREW_ROLES.map((r) => (
                  <label key={r} className="relative inline-flex">
                    <input type="checkbox" name="roles" value={r} defaultChecked={roles.has(r)} className="peer absolute inset-0 size-full cursor-pointer opacity-0" />
                    <span className="inline-flex h-10 items-center rounded-chip border border-line bg-ground px-3.5 text-small font-semibold peer-checked:border-ink peer-checked:bg-ink peer-checked:text-on-accent peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink">
                      {r}
                    </span>
                  </label>
                ))}
              </div>
              {one(sp.er) ? <p id="roles-error" role="alert" className="text-meta text-sindoor">{one(sp.er)}</p> : <p className="text-meta text-stone">Pick up to six.</p>}
            </fieldset>

            <Button type="submit" variant="secondary" size="md">Save</Button>
          </form>

          <div className="rounded-card bg-teal-tint p-4 text-small text-teal">
            Reviews are free and earn you points — a 5-star review adds {FIVE_STAR_POINTS} points toward {nextName ?? "your next level"}.
          </div>
        </aside>
      </div>
    </main>
  );
}
