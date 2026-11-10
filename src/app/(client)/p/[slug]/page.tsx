import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { openThreadAction } from "@/app/chat/[id]/actions";
import { PackagePicker } from "@/components/client/package-picker";
import { Button, CheckIcon, ChevronLeftIcon, StatusChip } from "@/components/ui";
import { LevelBadge } from "@/components/ui/level-badge";
import { formatRs, type Paisa } from "@/lib/money";
import { bsDayMonth, type IsoDate } from "@/lib/nepali-date";
import { db } from "@/server/db";
import { getVerifiedProvider, isSaait, slotsLeft } from "@/server/providers";
import { levelsFor } from "@/server/rewards/ledger";
import { parseClientQuery, queryString } from "@/server/client/query";

export async function generateMetadata({ params }: PageProps<"/p/[slug]">): Promise<Metadata> {
  await connection();
  const p = await getVerifiedProvider(db(), (await params).slug);
  return { title: p?.displayName ?? "Provider" };
}

export default async function ProviderPage({ params, searchParams }: PageProps<"/p/[slug]">) {
  await connection();
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const q = parseClientQuery(sp);
  const p = await getVerifiedProvider(db(), slug);
  if (!p) notFound();
  const [saait, slots, levels] = await Promise.all([isSaait(db(), q.date as IsoDate), slotsLeft(db(), [p.id], q.date as IsoDate), levelsFor(db(), [p.userId])]);
  const left = slots.get(p.id) ?? 0;
  const level = levels.get(p.userId) ?? "New";
  const inCategory = p.packages.filter((k) => k.category.slug === q.category);
  const packages = inCategory.length ? inCategory : p.packages;
  const heading = `${packages[0]?.category.shortName ?? "All"} packages`;
  const pick = typeof sp.package === "string" && packages.some((k) => k.id === sp.package) ? sp.package : (packages[Math.min(1, packages.length - 1)]?.id ?? "");
  const tones = p.portfolioTones.length ? p.portfolioTones : ["#D9D4CB", "#C7C9CF", "#CFC9D6", "#E0DCD3", "#BFC3C9"];
  const day = bsDayMonth(q.date);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-page flex-col md:px-gutter-desktop md:pt-8">
      <div className="relative">
        <div aria-hidden="true" className="grid h-59 grid-cols-3 grid-rows-2 gap-0.75 overflow-hidden md:h-80 md:rounded-card">
          <span className="row-span-2 block" style={{ background: tones[0] }} />
          {tones.slice(1, 5).map((t, i) => (
            <span key={i} className="block" style={{ background: t }} />
          ))}
        </div>
        <Link href={`/results?${queryString(q)}`} aria-label="Back" className="absolute top-13 left-3 flex size-11 items-center justify-center rounded-chip bg-ground md:top-3">
          <ChevronLeftIcon size={22} />
        </Link>
        {p.photoCount > 0 && (
          <span className="absolute top-13 right-3 flex h-9 items-center rounded-chip bg-ground px-3 text-meta font-semibold md:top-3">{p.photoCount} photos</span>
        )}
      </div>

      {/*
        Message opens the in-app conversation for this date. It is its own form
        (forms cannot nest), and its button sits in the Lock bar through form=.
        Signed-out visitors are sent to log in and come back here.
      */}
      <form id="message-form" action={openThreadAction} hidden>
        <input type="hidden" name="slug" value={p.slug} />
        <input type="hidden" name="date" value={q.date} />
      </form>
      {/* Shows the checked package's price on the Lock button, without JavaScript. */}
      <style>{packages.map((k) => `form:has(input[value="${k.id}"]:checked) [data-lock-price="${k.id}"]{display:inline}`).join("")}</style>
      <form action={`/book/${p.slug}`} method="get" className="flex flex-1 flex-col md:mt-6 md:grid md:grid-cols-[minmax(0,1fr)_400px] md:gap-12">
        <input type="hidden" name="date" value={q.date} />
        <input type="hidden" name="lat" value={q.lat} />
        <input type="hidden" name="lng" value={q.lng} />
        {q.place && <input type="hidden" name="place" value={q.place} />}
        <input type="hidden" name="category" value={q.category} />

        <div className="flex flex-1 flex-col gap-3.5 px-gutter pt-4 md:px-0 md:pt-0">
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-profile font-extrabold">{p.displayName}</h1>
              <StatusChip type="verified">{p.kind === "studio" ? "Verified studio" : "Verified"}</StatusChip>
              <LevelBadge level={level} />
            </div>
            <p className="text-small text-stone">
              {[
                p.city?.name,
                p.sinceYear ? `since ${p.sinceYear}` : null,
                p.ratingAvg ? `${p.ratingAvg.toFixed(1)} from ${p.ratingCount} reviews` : "New on Saait",
                p.completedBookings ? `${p.completedBookings} weddings on this app` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {left > 0 ? (
              <p className="flex items-center gap-1.5 text-small font-semibold text-teal">
                <CheckIcon size={16} />
                Free on {day}
                {p.dailyCapacity > 1 ? ` · ${left} of ${p.dailyCapacity} slots left` : ""}
              </p>
            ) : (
              <p className="text-small font-semibold text-sindoor">Not free on {day}. Pick another date.</p>
            )}
          </div>

          <div className="flex items-baseline justify-between">
            <h2 className="text-heading font-bold">{heading}</h2>
            <span className="text-meta text-stone">Fixed prices</span>
          </div>

          <PackagePicker
            selected={pick}
            packages={packages.map((k) => ({
              id: k.id,
              name: k.name,
              price: k.price as Paisa,
              peakSurcharge: k.peakSurcharge as Paisa,
              inclusions: k.inclusions,
              deliveryDays: k.deliveryDays,
            }))}
          />

          <p className="text-small text-stone">
            Want something different? Message the studio. They can send you a custom offer at any price you both agree on; the date still locks here.
          </p>
          {saait && <p className="text-meta text-marigold-text">{day} is a wedding date. Surcharges above are added at the price you see.</p>}
        </div>

        <div className="sticky bottom-0 mt-5 grid grid-cols-[120px_minmax(0,1fr)] items-center gap-2.5 border-t border-line bg-ground px-gutter pt-3 pb-7 md:static md:mt-0 md:flex md:h-fit md:flex-col md:items-stretch md:rounded-card md:border md:p-5">
          <Button type="submit" form="message-form" variant="secondary" className="min-w-0">
            Message
            <span className="sr-only truncate md:not-sr-only">{" "}{p.displayName}</span>
          </Button>
          <Button type="submit" disabled={left <= 0}>
            Lock {day}
            {packages.map((k) => (
              <span key={k.id} data-lock-price={k.id} className="hidden font-medium opacity-85">
                {formatRs(k.price as Paisa)}
              </span>
            ))}
          </Button>
          <p className="col-span-2 hidden text-meta text-stone md:block">
            You pay a 25% deposit and a booking fee now. The rest goes to {p.displayName} after the event.
          </p>
        </div>
      </form>
    </main>
  );
}

