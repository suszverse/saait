import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { PortfolioGrid } from "@/components/portfolio/portfolio-grid";
import { Button, TextField } from "@/components/ui";
import { limitsFor, nextLimits } from "@/lib/portfolio-limits";
import { requireProviderKind } from "@/server/auth/guards";
import { db } from "@/server/db";
import { listPortfolio } from "@/server/portfolio";
import { listReviewsFor } from "@/server/reviews";
import { levelsFor } from "@/server/rewards/ledger";
import { removePortfolioItem, saveBusinessProfile } from "./actions";

export const metadata: Metadata = { title: "Profile and portfolio" };

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

/** Business profile and portfolio editor (Figma P1). */
export default async function BusinessProfile({ searchParams }: { searchParams: Promise<Search> }) {
  await connection();
  const sp = await searchParams;
  const { user, profile } = await requireProviderKind("studio", "/business/profile");
  const d = db();
  const level = (await levelsFor(d, [user.id])).get(user.id) ?? "New";
  const input = { kind: "studio" as const, plan: profile.plan, level };
  const limits = limitsFor(input);
  const next = nextLimits(input);
  const [items, reviews] = await Promise.all([listPortfolio(d, profile.id, { id: user.id, role: user.role }), listReviewsFor(d, profile.id, { limit: 50 })]);

  const photos = items.filter((i) => i.mediaKind === "photo").length;
  const clips = items.filter((i) => i.mediaKind === "clip").length;
  const rating = profile.ratingAvg != null && profile.ratingCount > 0 ? ` · ${profile.ratingAvg.toFixed(1)}` : "";

  const typed = one(sp.vn) !== "" || one(sp.vb) !== "" || one(sp.vy) !== "";
  const values = typed
    ? { businessName: one(sp.vn), bio: one(sp.vb), sinceYear: one(sp.vy) }
    : { businessName: profile.businessName ?? "", bio: profile.bio ?? "", sinceYear: profile.sinceYear ? String(profile.sinceYear) : "" };

  return (
    <main className="mx-auto flex w-full max-w-page flex-1 flex-col gap-6 px-gutter pt-6 pb-8 md:px-gutter-desktop md:pt-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-profile font-extrabold">Profile and portfolio</h1>
        <p className="text-small text-stone">What clients see when they open your page.</p>
      </header>

      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Photos" value={`${photos} of ${limits.photos}`} />
        <Stat label="Clips" value={`${clips} of ${limits.clips}`} />
        <Stat label="Reviews" value={`${profile.ratingCount || reviews.length}${rating}`} />
      </dl>

      <div className="grid gap-8 md:grid-cols-[1fr_360px]">
        <div className="flex min-w-0 flex-col gap-8">
          <PortfolioGrid items={items} limit={limits.photos} nextLimit={next?.photos} kind="photo" label="Photos" removeAction={removePortfolioItem} />
          <PortfolioGrid items={items} limit={limits.clips} nextLimit={next?.clips} kind="clip" label="Clips" removeAction={removePortfolioItem} />
        </div>

        <aside className="flex flex-col gap-4">
          <div className="rounded-card bg-tint p-4">
            <h2 className="text-label font-extrabold">Every upload is checked like a chat message</h2>
            <p className="mt-1 text-small text-stone">
              New photos and clips are checked before clients see them. Anything with a phone number, handle or link in it is held, and we tell you why. Most are approved within a day.
            </p>
          </div>

          <form action={saveBusinessProfile} className="flex flex-col gap-4 rounded-card border border-line p-4">
            <h2 className="text-label font-extrabold">About</h2>
            {one(sp.saved) ? (
              <p role="status" className="rounded-control bg-teal-tint px-3 py-2 text-small font-semibold text-teal">Saved.</p>
            ) : null}
            {one(sp.ef) ? <p role="alert" className="text-small text-sindoor">{one(sp.ef)}</p> : null}
            <TextField id="businessName" name="businessName" label="Business name" defaultValue={values.businessName} error={one(sp.en) || undefined} required maxLength={80} />
            <TextField id="bio" name="bio" label="About your work" multiline rows={5} defaultValue={values.bio} error={one(sp.eb) || undefined} helper="Up to 600 characters." maxLength={600} />
            <TextField id="sinceYear" name="sinceYear" label="Working since" type="number" inputMode="numeric" defaultValue={values.sinceYear} error={one(sp.ey) || undefined} min={1980} max={new Date().getFullYear()} />
            <Button type="submit" variant="secondary" size="md">Save</Button>
          </form>

          <Link href="/business/reviews" className="flex items-center justify-between rounded-card border border-line p-4 hover:bg-tint">
            <span className="flex flex-col">
              <span className="text-label font-extrabold">Reviews</span>
              <span className="text-meta text-stone">{reviews.length === 0 ? "No reviews yet" : `${reviews.length} from clients`}</span>
            </span>
            <span aria-hidden className="text-stone">›</span>
          </Link>
        </aside>
      </div>
    </main>
  );
}
