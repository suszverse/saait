import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { BottomNav, ChevronLeftIcon, FilterChipLink, SaaitDot, ShieldIcon, StatusChip } from "@/components/ui";
import { formatRs, type Paisa } from "@/lib/money";
import { bsDayMonth } from "@/lib/nepali-date";
import { db } from "@/server/db";
import { BUDGET_BANDS, searchFreeOnDate, type BudgetBand } from "@/server/search";
import { parseClientQuery, queryString } from "@/server/client/query";

export const metadata: Metadata = { title: "Free on this date" };

function replies(minutes: number | null) {
  if (!minutes) return null;
  return minutes < 60 ? `replies in ${minutes} min` : `replies in ${Math.round(minutes / 60)} hour${minutes >= 120 ? "s" : ""}`;
}

export default async function ResultsPage({ searchParams }: PageProps<"/results">) {
  await connection();
  const q = parseClientQuery(await searchParams);
  const { place, category, saait, results } = await searchFreeOnDate(db(), q);
  const title = `${category?.shortName ?? "Providers"}, ${bsDayMonth(q.date)}`;

  return (
    <>
      <main className="mx-auto flex w-full max-w-page flex-1 flex-col px-gutter pt-14 pb-5 md:px-gutter-desktop md:pt-10">
        <header className="flex items-center gap-2">
          <Link href={`/?${queryString(q)}`} aria-label="Back" className="-ml-3 flex size-11 shrink-0 items-center justify-center rounded-control">
            <ChevronLeftIcon size={22} />
          </Link>
          <div className="flex min-w-0 flex-col">
            <h1 className="text-screen font-extrabold">{title}</h1>
            <p className={`flex items-center gap-1.5 text-meta ${saait ? "text-marigold-text" : "text-stone"}`}>
              {saait && <SaaitDot />}
              <span>
                {saait ? "Wedding date · " : ""}
                {place.label} and {place.radiusKm} km
              </span>
            </p>
          </div>
        </header>

        <nav aria-label="Budget" className="-mx-gutter mt-4 flex gap-2 overflow-x-auto px-gutter [scrollbar-width:none] md:mx-0 md:px-0">
          {(Object.keys(BUDGET_BANDS) as BudgetBand[]).map((b) => (
            <FilterChipLink key={b} href={`/results?${queryString({ ...q, band: b })}`} selected={q.band === b} scroll={false}>
              {BUDGET_BANDS[b].label}
            </FilterChipLink>
          ))}
        </nav>

        <p className="mt-3.5 text-small text-stone" aria-live="polite">
          {results.length} free · sorted by rating
        </p>

        <ul className="mt-2 grid gap-x-8 md:grid-cols-2">
          {results.map((r) => (
            <li key={r.id} className="border-b border-line py-3.5">
              <Link href={`/p/${r.slug}?${queryString(q)}`} className="grid grid-cols-[112px_minmax(0,1fr)] gap-3.5 no-underline">
                <span aria-hidden="true" className="block aspect-[4/5] rounded-card" style={{ background: r.tones[0] ?? "#D9D4CB" }} />
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-lead font-bold">{r.name}</span>
                    <StatusChip type="verified" size="sm" />
                  </span>
                  <span className="text-meta text-stone">
                    {[r.cityName, r.rating ? `${r.rating.toFixed(1)} (${r.ratingCount})` : "New", replies(r.responseMinutes)].filter(Boolean).join(" · ")}
                  </span>
                  <span className="text-meta text-stone">
                    {r.completed} {category?.slug.startsWith("wedding") ? "weddings" : "bookings"} on this app
                  </span>
                  <span className="mt-auto flex items-baseline justify-between gap-2">
                    <span className="text-body leading-field font-bold whitespace-nowrap">From {formatRs(r.fromPrice as Paisa)}</span>
                    <span className="text-right text-micro font-normal text-marigold-text">
                      {r.fromPeakSurcharge > 0 ? `+${formatRs(r.fromPeakSurcharge as Paisa)} on this date` : saait ? "No surcharge" : ""}
                    </span>
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>

        {results.length === 0 && (
          <p className="mt-4 rounded-card bg-tint px-4 py-3.5 text-small">
            Nobody in this budget is free that day. Try{" "}
            <Link href={`/results?${queryString({ ...q, band: "any" })}`} className="font-semibold">
              any budget
            </Link>{" "}
            or{" "}
            <Link href={`/?${queryString(q)}`} className="font-semibold">
              another date
            </Link>
            .
          </p>
        )}

        <aside className="mt-3.5 flex items-start gap-3 rounded-card bg-tint px-4 py-3.5 md:max-w-[560px]">
          <ShieldIcon size={20} className="mt-0.5 shrink-0 text-teal" />
          <p className="text-meta">
            Every provider here has shown ID and a PAN to our team. If one cancels, we replace them from this list or refund your deposit.
          </p>
        </aside>
      </main>
      <BottomNav role="client" active="browse" />
    </>
  );
}
