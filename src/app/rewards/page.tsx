import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Button, ChevronLeftIcon } from "@/components/ui";
import { LevelBadge } from "@/components/ui/level-badge";
import { env } from "@/env";
import { LEVELS, levelFor, nextLevel, type LevelName } from "@/lib/levels";
import { formatRs, paisa } from "@/lib/money";
import { bsLongWithGregorian, isIsoDate } from "@/lib/nepali-date";
import { PLAN_MONTH_POINTS, PLANS } from "@/lib/plans";
import { requireUser, type CurrentUser, type ProviderProfile } from "@/server/auth/guards";
import { db } from "@/server/db";
import { providerForUser } from "@/server/provider-account";
import { creditBalance, lifetimePoints, pointsBalance } from "@/server/rewards/ledger";
import { redeemAction } from "./actions";
import { REDEEM_OUTCOMES, type RedeemOutcome } from "./outcomes";

export const metadata: Metadata = { title: "Rewards" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const points = new Intl.NumberFormat("en-US");

/** Copy for the four ways a client earns credit (leakage-and-rewards.md, section 7). */
const CLIENT_EARN = [
  { what: "Complete a booking and confirm the balance was paid", get: "25% of the booking fee back as credit" },
  { what: "Leave a review", get: formatRs(paisa(10000)) },
  { what: "A friend you invited completes a booking", get: `${formatRs(paisa(30000))} for each of you` },
  { what: "Report a provider who asked to be paid outside Saait, once our team confirms it", get: formatRs(paisa(20000)) },
] as const;

/** The points table for businesses and freelancers (section 7). Penalties read as a minus sign, not a colour. */
const POINTS_TABLE = [
  { what: "Complete a booking or crew job through Saait", pts: 100 },
  { what: "Deliver on time", pts: 30 },
  { what: "Get a 5-star review", pts: 20 },
  { what: "Accept and complete an urgent job", pts: 50 },
  { what: "90 days with no held messages", pts: 50 },
  { what: "No-show", pts: -200 },
] as const;

const UNLOCKS: Record<LevelName, { all: string; freelancer?: string; business?: string }> = {
  New: { all: "Listed, chat, bookings" },
  Trusted: { all: "Trusted badge, first look at urgent jobs in your tier" },
  Proven: { all: "Higher placement on wedding dates", freelancer: "Backup pool", business: "10% off the plan" },
  Top: { all: "Featured slot each month", freelancer: "Open a public business profile at half price" },
};

function isOutcome(v: unknown): v is RedeemOutcome {
  return typeof v === "string" && (REDEEM_OUTCOMES as readonly string[]).includes(v);
}

function redeemMessage(outcome: RedeemOutcome, until: string | undefined, balance: number): { text: string; ok: boolean } {
  switch (outcome) {
    case "ok":
      return { ok: true, text: until && isIsoDate(until) ? `Done. Business is yours until ${bsLongWithGregorian(until)}.` : "Done. A month of Business has been added." };
    case "insufficient_points":
      return { ok: false, text: `A plan month costs ${points.format(PLAN_MONTH_POINTS)} points; you have ${points.format(balance)}.` };
    case "not_a_business":
      return { ok: false, text: "Only a business account can spend points on a plan month." };
    case "points_frozen":
      return { ok: false, text: "Points are on hold while our team reviews a report. They are back once it is resolved." };
    case "not_found":
      return { ok: false, text: "We could not find your provider account. Finish onboarding first." };
  }
}

/**
 * Figma C7 "Saait credit and rewards" for clients, B3 "Rewards and plan" for
 * businesses and freelancers. Rewards are Teal; no Sindoor or Marigold here.
 */
export default async function RewardsPage({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const user = await requireUser("/rewards");
  const profile = await providerForUser(user.id);
  const sp = await searchParams;

  return (
    <>
      <header className="border-b border-line bg-ground">
        <div className="mx-auto flex h-14 max-w-page items-center justify-between px-gutter md:h-16 md:px-gutter-desktop">
          <Link href="/" className="text-brand font-extrabold no-underline">
            Saait
          </Link>
          <Link href="/" className="-mr-3 flex min-h-11 items-center gap-1 rounded-control px-3 text-small font-semibold no-underline">
            <ChevronLeftIcon size={18} />
            Back
          </Link>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-form flex-col gap-5 px-gutter pt-6 pb-10 md:max-w-[560px] md:pt-10">
        {!profile ? (
          <ClientRewards user={user} />
        ) : profile.kind === "studio" ? (
          <BusinessRewards user={user} profile={profile} outcome={isOutcome(sp.redeem) ? sp.redeem : undefined} until={typeof sp.until === "string" ? sp.until : undefined} />
        ) : (
          <FreelancerRewards user={user} />
        )}
      </main>
    </>
  );
}

/* ---------- Client (C7) ---------- */

async function ClientRewards({ user }: { user: CurrentUser }) {
  const credit = await creditBalance(db(), user.id);
  const inviteLink = user.referralCode ? `${env().APP_URL}/join?ref=${encodeURIComponent(user.referralCode)}` : null;

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-title font-extrabold">Saait credit</h1>
        <p className="text-small text-stone">Credit comes off your booking fee at checkout, on its own line. It lasts 12 months from the day you earn it.</p>
      </div>

      <section aria-label="Your credit" className="rounded-card bg-teal-tint p-5">
        <p className="text-small font-semibold text-teal">Saait credit</p>
        <p className="text-title font-extrabold text-teal">{formatRs(credit)}</p>
        <p className="mt-1 text-meta text-teal">Applied automatically to your next booking fee</p>
      </section>

      <section className="flex flex-col gap-3 rounded-card border border-line bg-ground p-5" aria-labelledby="how-to-earn">
        <h2 id="how-to-earn" className="text-heading font-bold">
          How to earn
        </h2>
        <ul className="flex flex-col divide-y divide-line">
          {CLIENT_EARN.map((row) => (
            <li key={row.what} className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
              <span className="text-small">{row.what}</span>
              <span className="shrink-0 text-right text-small font-bold text-teal">{row.get}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-2 rounded-card border border-line bg-ground p-5" aria-labelledby="invite">
        <h2 id="invite" className="text-heading font-bold">
          Invite a friend
        </h2>
        <p className="text-small text-stone">When someone you invite completes a booking, you both get {formatRs(paisa(30000))} in credit.</p>
        {inviteLink ? (
          <p className="mt-1 rounded-control bg-tint px-3.5 py-2.5 text-small font-semibold break-all select-all">{inviteLink}</p>
        ) : (
          <p className="mt-1 rounded-control bg-tint px-3.5 py-2.5 text-small text-stone">Your invite link appears here soon.</p>
        )}
      </section>
    </>
  );
}

/* ---------- Shared: points, level, progress ---------- */

async function LevelCard({ user, children }: { user: CurrentUser; children?: React.ReactNode }) {
  const [balance, lifetime] = await Promise.all([pointsBalance(db(), user.id), lifetimePoints(db(), user.id)]);
  const level = levelFor(lifetime);
  const next = nextLevel(lifetime);
  const currentMin = LEVELS.find((l) => l.name === level)?.min ?? 0;
  // The bar runs from the current threshold to the next one; a negative lifetime still sits at the start of New.
  const nextMin = next ? Math.max(0, lifetime) + next.pointsToGo : currentMin;
  const progress = next ? Math.min(100, Math.round(((Math.max(0, lifetime) - currentMin) / Math.max(1, nextMin - currentMin)) * 100)) : 100;

  return (
    <section aria-label="Your points and level" className="flex flex-col gap-4 rounded-card bg-teal-tint p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-small font-semibold text-teal">Points</p>
          <p className="text-title font-extrabold text-teal">{points.format(balance)}</p>
        </div>
        <LevelBadge level={level} />
      </div>
      <div className="flex flex-col gap-1.5">
        <div
          role="progressbar"
          aria-label={next ? `Progress to ${next.name}` : "Top level reached"}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
          className="h-2 overflow-hidden rounded-chip bg-ground"
        >
          <div className="h-full rounded-chip bg-teal" style={{ width: `${progress}%` }} />
        </div>
        <p className="text-meta text-teal">
          {next ? `${points.format(next.pointsToGo)} more points to ${next.name}` : "You are at the top level"}
          {balance !== lifetime && ` · ${points.format(lifetime)} lifetime`}
        </p>
      </div>
      {children}
    </section>
  );
}

function PointsTable() {
  return (
    <section className="flex flex-col gap-3 rounded-card border border-line bg-ground p-5" aria-labelledby="earn-points">
      <h2 id="earn-points" className="text-heading font-bold">
        How points work
      </h2>
      <ul className="flex flex-col divide-y divide-line">
        {POINTS_TABLE.map((row) => (
          <li key={row.what} className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
            <span className="text-small">{row.what}</span>
            <span className={`shrink-0 text-small font-bold tabular-nums ${row.pts > 0 ? "text-teal" : "text-ink"}`}>
              {row.pts > 0 ? `+${row.pts}` : `−${Math.abs(row.pts)}`}
            </span>
          </li>
        ))}
        <li className="flex items-start justify-between gap-4 py-3 last:pb-0">
          <span className="text-small">A deal taken outside Saait, once our team confirms it</span>
          <span className="shrink-0 text-small font-bold">Level reset to New</span>
        </li>
      </ul>
      <p className="text-meta text-stone">Spending points never lowers your level. Your level counts lifetime points minus penalties.</p>
    </section>
  );
}

/* ---------- Business (B3) ---------- */

async function BusinessRewards({ user, profile, outcome, until }: { user: CurrentUser; profile: ProviderProfile; outcome?: RedeemOutcome; until?: string }) {
  const balance = await pointsBalance(db(), user.id);
  const plan = PLANS[profile.plan];
  const canRedeem = balance >= PLAN_MONTH_POINTS;
  const message = outcome ? redeemMessage(outcome, until, balance) : null;

  return (
    <>
      <h1 className="text-title font-extrabold">Rewards and plan</h1>
      <LevelCard user={user} />

      <section className="flex flex-col gap-3 rounded-card border border-line bg-ground p-5" aria-labelledby="plan">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="plan" className="text-heading font-bold">
            {plan.label} plan
          </h2>
          <span className="text-small font-semibold text-stone">{plan.monthlyPaisa === 0 ? "Free" : `${formatRs(paisa(plan.monthlyPaisa))} / month`}</span>
        </div>
        <p className="text-small text-stone">
          {points.format(PLAN_MONTH_POINTS)} points buy one month of {PLANS.pro.label}. A month bought early extends your current period.
        </p>
        <form action={redeemAction} className="flex flex-col gap-2">
          <Button type="submit" variant="secondary" size="lg" disabled={!canRedeem} aria-describedby={message ? "redeem-status" : undefined}>
            Use {points.format(PLAN_MONTH_POINTS)} points for a month of {PLANS.pro.label}
          </Button>
          {message ? (
            <p id="redeem-status" role="status" className={`text-small ${message.ok ? "font-semibold text-teal" : "text-stone"}`}>
              {message.text}
            </p>
          ) : (
            !canRedeem && (
              <p className="text-small text-stone" aria-live="polite">
                {points.format(PLAN_MONTH_POINTS - balance)} more points and you can claim a month.
              </p>
            )
          )}
        </form>
      </section>

      <PointsTable />
    </>
  );
}

/* ---------- Freelancer (B3, crew variant) ---------- */

async function FreelancerRewards({ user }: { user: CurrentUser }) {
  const lifetime = await lifetimePoints(db(), user.id);
  const level = levelFor(lifetime);

  return (
    <>
      <h1 className="text-title font-extrabold">Points and level</h1>
      <LevelCard user={user} />

      <section className="flex flex-col gap-3 rounded-card border border-line bg-ground p-5" aria-labelledby="ladder">
        <h2 id="ladder" className="text-heading font-bold">
          Levels
        </h2>
        <ol className="flex flex-col divide-y divide-line">
          {LEVELS.map((l) => {
            const u = UNLOCKS[l.name];
            const current = l.name === level;
            return (
              <li key={l.name} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0" aria-current={current ? "step" : undefined}>
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2">
                    <LevelBadge level={l.name} size="sm" />
                    {current && <span className="text-micro font-semibold text-stone">You are here</span>}
                  </span>
                  <span className="text-small font-semibold tabular-nums text-stone">{points.format(l.min)} pts</span>
                </div>
                <p className="text-small">{[u.all, u.freelancer].filter(Boolean).join(" · ")}</p>
              </li>
            );
          })}
        </ol>
      </section>

      <PointsTable />
    </>
  );
}
