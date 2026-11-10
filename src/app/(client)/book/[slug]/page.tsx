import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { ChevronLeftIcon, SaaitDot } from "@/components/ui";
import { fullRefundBefore } from "@/lib/fees";
import { bsDayMonth, bsLongWithGregorian, type IsoDate } from "@/lib/nepali-date";
import { requireUser } from "@/server/auth/guards";
import { BookingError, NEPAL_BOUNDS, creditAvailableFor, priceCheckout } from "@/server/bookings";
import { queryString, parseClientQuery } from "@/server/client/query";
import { db } from "@/server/db";
import { BookingForm } from "./booking-form";

export const metadata: Metadata = { title: "Lock the date" };

/** Traffic Chowk, Butwal: where a search lands when no point was chosen. */
const DEFAULT_PIN = { lat: 27.7006, lng: 83.4483, label: "Traffic Chowk, Butwal" };

/**
 * The search point travels in the URL as `lat`/`lng` (and a `place` label).
 * Anything missing or outside Nepal falls back to the default pin; the server
 * checks the bounds again on submit.
 */
function venuePin(sp: Record<string, string | string[] | undefined>) {
  const num = (k: string) => (typeof sp[k] === "string" && sp[k] !== "" ? Number(sp[k]) : NaN);
  const lat = num("lat");
  const lng = num("lng");
  const inside = lat >= NEPAL_BOUNDS.lat[0] && lat <= NEPAL_BOUNDS.lat[1] && lng >= NEPAL_BOUNDS.lng[0] && lng <= NEPAL_BOUNDS.lng[1];
  if (!inside) return DEFAULT_PIN;
  const place = typeof sp.place === "string" ? sp.place.trim().slice(0, 80) : "";
  return { lat, lng, label: place || `${lat.toFixed(4)}, ${lng.toFixed(4)}` };
}

export default async function BookPage({ params, searchParams }: PageProps<"/book/[slug]">) {
  await connection();
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const q = parseClientQuery(sp);
  const packageId = typeof sp.package === "string" ? sp.package : "";
  const back = `/p/${slug}?${queryString(q)}`;
  if (!/^[0-9a-f-]{36}$/.test(packageId)) redirect(back);
  const user = await requireUser(`/book/${slug}?${queryString(q)}&package=${packageId}`);
  const creditAvailable = await creditAvailableFor(db(), user.id);

  let priced;
  try {
    priced = await priceCheckout(db(), { providerSlug: slug, packageId, date: q.date as IsoDate, addonIds: [], creditAvailable });
  } catch (e) {
    if (e instanceof BookingError) notFound();
    throw e;
  }
  const { provider, pkg, addons, saait } = priced;
  const pin = venuePin(sp);
  const day = bsDayMonth(q.date);
  const who = provider.kind === "studio" ? "the studio" : "the provider";

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[560px] flex-col px-gutter pt-14 md:pt-10">
      <header className="flex items-center gap-2">
        <Link href={back} aria-label="Back" className="-ml-3 flex size-11 items-center justify-center rounded-control">
          <ChevronLeftIcon size={22} />
        </Link>
        <h1 className="text-screen font-extrabold">Lock {day}</h1>
      </header>

      <section className="mt-3.5 grid grid-cols-[56px_minmax(0,1fr)] items-center gap-3 rounded-card border border-line px-4 py-3.5" aria-label="Your booking">
        <span aria-hidden="true" className="block h-17.5 w-14 rounded-control" style={{ background: provider.portfolioTones[0] ?? "#D9D4CB" }} />
        <div className="flex flex-col gap-0.5">
          <p className="text-body leading-field font-bold">
            {provider.displayName} · {pkg.name}
          </p>
          <p className="text-meta text-stone">{pkg.inclusions.slice(0, 3).join(" · ")}</p>
          <p className={`flex items-center gap-1.5 text-meta ${saait ? "text-marigold-text" : "text-stone"}`}>
            {saait && <SaaitDot />}
            {bsLongWithGregorian(q.date)}
          </p>
        </div>
      </section>

      <div className="mt-4 flex flex-1 flex-col">
        <BookingForm
          providerSlug={slug}
          providerKind={provider.kind}
          packageId={pkg.id}
          packageName={pkg.name}
          date={q.date}
          packagePrice={pkg.price}
          peakSurcharge={saait ? pkg.peakSurcharge : 0}
          depositPercent={pkg.depositPercent}
          creditAvailable={creditAvailable}
          addons={addons.map((a) => ({ id: a.id, name: a.name, price: a.price }))}
          pin={pin}
          refundLine={`Full refund if you cancel before ${bsDayMonth(fullRefundBefore(q.date))}. If ${who} cancels, we send a verified replacement or refund everything. Deposit is released to ${who} only after you confirm delivery.`}
        />
      </div>
    </main>
  );
}
