import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { env } from "@/env";
import { BottomNav, ChevronLeftIcon, ClockIcon, buttonClass } from "@/components/ui";

export const metadata: Metadata = { title: "Urgent request" };

/**
 * Phase 2 hook. The SMS broadcast and dispatch engine (system plan section 14)
 * ship with the backup pool. Until then urgent requests go to the Saait desk,
 * which places them by hand: the manual fallback for the same flow.
 */
export default async function UrgentPage() {
  await connection();
  const wa = `https://wa.me/${env().DESK_WHATSAPP}?text=${encodeURIComponent("Urgent request: I need a photographer within 72 hours.")}`;
  return (
    <>
      <main className="mx-auto flex w-full max-w-form flex-1 flex-col">
        <header className="flex flex-col gap-2.5 bg-marigold-tint px-gutter pt-14 pb-4.5">
          <div className="flex items-center gap-2">
            <Link href="/" aria-label="Back" className="-ml-3 flex size-11 items-center justify-center rounded-control">
              <ChevronLeftIcon size={22} />
            </Link>
            <h1 className="text-screen font-extrabold">Urgent request</h1>
          </div>
          <p className="text-label text-marigold-text">Need someone within 72 hours? The Saait desk finds a verified provider who is free and calls you back.</p>
        </header>
        <div className="flex flex-col gap-4 px-gutter pt-5">
          <p className="flex items-start gap-3 rounded-card bg-tint px-4 py-3.5 text-small">
            <ClockIcon size={20} className="mt-0.5 shrink-0" />
            Tell us the date, time, venue and what you need. We usually reply within 15 minutes between 7 am and 9 pm.
          </p>
          <a href={wa} target="_blank" rel="noopener noreferrer" className={buttonClass("urgent", "lg", "no-underline")}>
            Message the Saait desk
          </a>
          <p className="text-meta text-stone">Urgent bookings carry a Rs 1,000 surcharge on top of the booking fee; Rs 600 of it goes to the provider.</p>
        </div>
      </main>
      <BottomNav role="client" active="dates" />
    </>
  );
}
