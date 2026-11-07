import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { env } from "@/env";
import { Button, ChevronLeftIcon } from "@/components/ui";
import { formatRs, paisa } from "@/lib/money";
import { bsDayMonth } from "@/lib/nepali-date";
import { requireUser } from "@/server/auth/guards";
import { bookingForClient, holdState } from "@/server/bookings";
import { db } from "@/server/db";
import { METHOD_LABEL, type PaymentMethod } from "@/server/payments";
import { simulatePayment } from "./actions";

export const metadata: Metadata = { title: "Pay the deposit" };

export default async function PayPage({ params }: PageProps<"/bookings/[code]/pay">) {
  await connection();
  const { code } = await params;
  const user = await requireUser(`/bookings/${code}/pay`);
  const row = await bookingForClient(db(), code, user.id);
  if (!row || !row.pay) notFound();
  if (row.b.status !== "held") redirect(`/bookings/${code}`);
  // Never ask for money against a hold that has lapsed.
  const hold = await holdState(db(), row.b.id);
  if (!hold.live) redirect(`/bookings/${code}`);
  const until = hold.expiresAt!.toLocaleString("en-GB", { timeZone: "Asia/Kathmandu", weekday: "short", hour: "numeric", minute: "2-digit" });
  const method = METHOD_LABEL[row.pay.method as PaymentMethod] ?? "eSewa";
  const amount = formatRs(paisa(row.pay.amount));

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-form flex-col gap-5 px-gutter pt-14 pb-10">
      <header className="flex items-center gap-2">
        <Link href={`/bookings/${code}`} aria-label="Back" className="-ml-3 flex size-11 items-center justify-center rounded-control">
          <ChevronLeftIcon size={22} />
        </Link>
        <h1 className="text-screen font-extrabold">Pay {amount}</h1>
      </header>
      <p className="text-body">
        {bsDayMonth(row.b.day)} is held for you with {row.p.displayName} until {until}. Pay the deposit and booking fee to lock it.
      </p>
      <ol className="flex flex-col gap-3 rounded-card bg-tint px-4 py-3.5 text-small">
        <li>
          1. Open {method} and send <strong>{amount}</strong> to the Saait merchant account.
        </li>
        <li>
          2. Write <strong>{code}</strong> as the remark so we can match it.
        </li>
        <li>3. We confirm by SMS, usually within the hour. Your date is locked when the SMS arrives.</li>
      </ol>
      <p className="text-meta text-stone">
        Online {method} checkout opens once our merchant account is live. Until then the Saait desk confirms each payment by hand.
      </p>
      {env().PAYMENT_SIMULATOR === "on" && (
        <form action={simulatePayment} className="flex flex-col gap-2 rounded-card border border-dashed border-check-border p-4">
          <input type="hidden" name="code" value={code} />
          <p className="text-meta text-stone">Development only: act as {method} confirming the payment.</p>
          <Button type="submit" variant="secondary">
            Simulate {method} payment
          </Button>
        </form>
      )}
    </main>
  );
}
