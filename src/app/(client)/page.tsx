import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { CategoryChips } from "@/components/client/category-chips";
import { DateStrip } from "@/components/client/date-strip";
import { PlacePicker } from "@/components/client/place-picker";
import { BellIcon, BottomNav, ChevronRightIcon, ClockIcon, ProviderTile } from "@/components/ui";
import { formatRs, type Paisa } from "@/lib/money";
import { addDays, bsDayMonth, bsDayMonthNp, type IsoDate } from "@/lib/nepali-date";
import { db } from "@/server/db";
import { nearestPlaces } from "@/server/places";
import { getCategories, saaitDaysBetween } from "@/server/providers";
import { searchFreeOnDate } from "@/server/search";
import { parseClientQuery, queryString } from "@/server/client/query";

export const metadata: Metadata = { title: { absolute: "Saait · Lock your date" } };

export default async function HomePage({ searchParams }: PageProps<"/">) {
  await connection();
  const q = parseClientQuery(await searchParams);
  const [categories, saait, found, nearby] = await Promise.all([
    getCategories(db()),
    saaitDaysBetween(db(), addDays(q.date, -7), addDays(q.date, 14)),
    searchFreeOnDate(db(), q),
    nearestPlaces(db(), { lat: q.lat, lng: q.lng }, 4),
  ]);
  const isSaait = saait.has(q.date as IsoDate);
  const n = found.results.length;
  const dateLine = isSaait
    ? `${bsDayMonth(q.date)} is a wedding date. Book early, ${n} ${n === 1 ? "provider" : "providers"} still free.`
    : n > 0
      ? `${bsDayMonth(q.date)} is open. ${n} ${n === 1 ? "provider is" : "providers are"} free.`
      : `Nobody is free on ${bsDayMonth(q.date)} yet. Try a nearby date.`;
  const href = (over: Partial<typeof q>) => `/?${queryString({ ...q, ...over })}`;
  const results = `/results?${queryString(q)}`;
  // Everything but the point; the picker adds lat, lng and place in the browser.
  const baseQuery = queryString({ date: q.date, category: q.category, band: q.band, radiusKm: q.radiusKm });

  return (
    <>
      <main className="mx-auto flex w-full max-w-page flex-1 flex-col gap-5 px-gutter pt-14 pb-8 md:px-gutter-desktop md:pt-10">
        <h1 className="sr-only">Saait: find a photographer free on your date</h1>
        <header className="relative">
          <Link href="/login" aria-label="Notifications" className="absolute top-0 right-0 flex size-11 items-center justify-center rounded-control md:hidden">
            <BellIcon size={22} />
          </Link>
          <PlacePicker current={{ label: found.place.label, lat: found.place.lat, lng: found.place.lng }} nearby={nearby} baseQuery={baseQuery} />
        </header>

        <div className="grid grid-cols-[minmax(0,1fr)] gap-5 md:grid-cols-[minmax(0,420px)_minmax(0,1fr)] md:gap-x-16">
          <div className="flex min-w-0 flex-col gap-5">
            <DateStrip day={q.date} saait={saait} hrefFor={(d) => href({ date: d })} />
            <p className="-mt-2.5 text-small text-stone" aria-live="polite">
              {dateLine}
            </p>
            <CategoryChips label="Service" categories={categories} current={q.category} hrefFor={(c) => href({ category: c })} />

            <Link
              href="/urgent"
              className="flex items-center gap-3.5 rounded-card border border-marigold-line bg-marigold-tint px-4 py-3.5 no-underline"
            >
              <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-control bg-marigold text-ink">
                <ClockIcon size={22} />
              </span>
              <span className="flex flex-1 flex-col gap-0.5">
                <span className="text-body leading-field font-bold">Need someone within 72 hours?</span>
                <span className="text-meta text-marigold-text">Verified providers get an SMS. First to accept is yours.</span>
              </span>
              <ChevronRightIcon size={20} />
            </Link>
          </div>

          <section aria-labelledby="free-heading" className="flex min-w-0 flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <h2 id="free-heading" className="text-heading font-bold">
                Free on {bsDayMonth(q.date)} <span className="font-semibold text-stone">· {bsDayMonthNp(q.date)}</span>
              </h2>
              {n > 0 && (
                <Link href={results} className="flex min-h-11 items-center text-small font-semibold text-ink underline underline-offset-4">
                  See all {n}
                </Link>
              )}
            </div>
            {n === 0 ? (
              <p className="rounded-card bg-tint px-4 py-3.5 text-small">No verified provider is free that day near {found.place.label}. Pick another date above.</p>
            ) : (
              <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
                {found.results.slice(0, 8).map((r, i) => (
                  <li key={r.id} className={i >= 2 ? "hidden md:block" : undefined}>
                    <ProviderTile
                      href={`/p/${r.slug}?${queryString(q)}`}
                      name={r.name}
                      meta={`${r.cityName}${r.rating ? ` · ${r.rating.toFixed(1)} (${r.ratingCount})` : ""}`}
                      price={`From ${formatRs(r.fromPrice as Paisa)}`}
                      tone={r.tones[0] ?? "#D9D4CB"}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>
      <BottomNav role="client" active="dates" />
    </>
  );
}
