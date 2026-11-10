import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { PayoutQr } from "@/components/booking/payout-qr";
import { BottomNav, Button, ButtonLink, CheckIcon, StatusChip } from "@/components/ui";
import { formatRs, paisa } from "@/lib/money";
import { bsLongWithGregorian, todayInNepal } from "@/lib/nepali-date";
import { requireUser } from "@/server/auth/guards";
import { contactFor } from "@/server/booking-contact";
import { bookingForClient, completionCreditFor, holdState } from "@/server/bookings";
import { db } from "@/server/db";
import { markBalancePaid } from "./actions";

export const metadata: Metadata = { title: "Booking" };

const STATUS: Record<string, { label: string; type: "verified" | "saait" | "under_review" | "rejected" }> = {
  held: { label: "Held, waiting for payment", type: "saait" },
  confirmed: { label: "Locked", type: "verified" },
  in_progress: { label: "Today", type: "verified" },
  delivered: { label: "Delivered", type: "verified" },
  completed: { label: "Completed", type: "verified" },
  cancelled: { label: "Cancelled", type: "rejected" },
  disputed: { label: "In dispute", type: "under_review" },
};

export default async function BookingPage({ params }: PageProps<"/bookings/[code]">) {
  await connection();
  const { code } = await params;
  const user = await requireUser(`/bookings/${code}`);
  const row = await bookingForClient(db(), code, user.id);
  if (!row) notFound();
  const { b, p } = row;
  const lapsed = b.status === "held" && !(await holdState(db(), b.id)).live;
  const st = lapsed ? { label: "Hold expired", type: "rejected" as const } : STATUS[b.status];
  const who = p.kind === "studio" ? "the studio" : "the provider";
  const contact = await contactFor(db(), b, user);
  const canMarkPaid = (b.status === "confirmed" || b.status === "in_progress" || b.status === "delivered") && !b.balancePaidClientConfirmedAt;
  const credit = b.status === "completed" && b.balancePaidClientConfirmedAt ? await completionCreditFor(db(), b.id, user.id) : 0;

  return (
    <>
      <main className="mx-auto flex w-full max-w-[560px] flex-1 flex-col gap-4 px-gutter pt-14 pb-8 md:pt-10">
        {b.status === "confirmed" && (
          <div className="flex items-center gap-2 text-heading font-bold text-teal">
            <CheckIcon size={22} />
            Your date is locked
          </div>
        )}
        <header className="flex flex-col gap-1">
          <p className="text-small text-stone">Booking {b.code}</p>
          <h1 className="text-title font-extrabold">{p.displayName}</h1>
          <p className="text-small">{bsLongWithGregorian(b.day)}</p>
          <div>
            <StatusChip type={st.type}>{st.label}</StatusChip>
          </div>
        </header>
        <dl className="flex flex-col gap-2 rounded-card border border-line px-4 py-3.5 text-small">
          <div className="flex justify-between gap-2">
            <dt className="text-stone">Package</dt>
            <dd className="font-semibold whitespace-nowrap">{b.packageName}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-stone">Venue</dt>
            <dd className="text-right font-semibold">{b.venue}</dd>
          </div>
          <div className="flex justify-between gap-2 border-t border-line pt-2">
            <dt className="text-stone">Agreed total</dt>
            <dd className="font-semibold whitespace-nowrap">{formatRs(paisa(b.agreedTotal))}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-stone">Deposit {b.status === "held" ? "due now" : "held by Saait"}</dt>
            <dd className="font-semibold whitespace-nowrap">{formatRs(paisa(b.depositAmount))}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-stone">Booking guarantee fee</dt>
            <dd className="font-semibold whitespace-nowrap">{formatRs(paisa(b.bookingFee))}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-stone">Balance, paid to {who} after the event</dt>
            <dd className="font-semibold whitespace-nowrap">{formatRs(paisa(b.balanceDue))}</dd>
          </div>
        </dl>
        {contact.kind !== "none" && (
          <section className="flex flex-col gap-1 rounded-card border border-line px-4 py-3.5 text-small">
            <h2 className="text-stone">Contact</h2>
            {contact.kind === "revealed" ? (
              <p className="font-semibold">
                {contact.name},{" "}
                <a href={`tel:${contact.phone}`} className="underline">
                  {contact.phone}
                </a>
              </p>
            ) : (
              <p className="font-semibold">Shown from {bsLongWithGregorian(todayInNepal(contact.revealAt))}</p>
            )}
            <p className="text-meta text-stone">Phone numbers are shared 48 hours before your event.</p>
          </section>
        )}
        <PayoutQr
          bookingCode={b.code}
          bookingStatus={b.status}
          provider={{ kycStatus: p.kycStatus, payoutMethod: p.payoutMethod, payoutAccountName: p.payoutAccountName, payoutAccountNumber: p.payoutAccountNumber }}
        />
        {canMarkPaid && (
          <form action={markBalancePaid} className="flex flex-col gap-2">
            <input type="hidden" name="code" value={b.code} />
            <Button type="submit" variant="secondary">
              I paid the balance
            </Button>
            <p className="text-meta text-stone">Marking it paid completes your booking once the event day has passed, and adds your Saait credit.</p>
          </form>
        )}
        {b.balancePaidClientConfirmedAt && (
          <div className="flex flex-col gap-1 rounded-card border border-line px-4 py-3.5 text-small">
            <p className="flex items-center gap-2 font-semibold text-teal">
              <CheckIcon size={18} />
              Balance marked as paid
            </p>
            {credit > 0 && <p className="text-stone">{formatRs(paisa(credit))} credit added</p>}
          </div>
        )}
        {b.status === "held" && !lapsed && <ButtonLink href={`/bookings/${b.code}/pay`}>Pay {formatRs(paisa(b.depositAmount + b.bookingFee))} to lock</ButtonLink>}
        {lapsed && (
          <p className="rounded-card bg-tint px-4 py-3.5 text-small">
            The 24-hour hold ran out before payment, so the date was released. Nothing was charged.{" "}
            <Link href={`/p/${p.slug}?date=${b.day}`} className="font-semibold">
              See if it is still free
            </Link>
            .
          </p>
        )}
        <p className="text-meta text-stone">
          Questions? <Link href="/urgent" className="font-semibold">Contact the Saait desk</Link> and quote {b.code}.
        </p>
      </main>
      <BottomNav role="client" active="bookings" />
    </>
  );
}
