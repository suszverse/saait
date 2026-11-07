import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { BottomNav, ButtonLink } from "@/components/ui";
import { bsDayMonth } from "@/lib/nepali-date";
import { requireUser } from "@/server/auth/guards";
import { bookingsForClient } from "@/server/bookings";
import { db } from "@/server/db";

export const metadata: Metadata = { title: "Your bookings" };

export default async function BookingsPage() {
  await connection();
  const user = await requireUser("/bookings");
  const rows = await bookingsForClient(db(), user.id);
  return (
    <>
      <main className="mx-auto flex w-full max-w-[560px] flex-1 flex-col gap-4 px-gutter pt-14 pb-8 md:pt-10">
        <h1 className="text-title font-extrabold">Your bookings</h1>
        {rows.length === 0 ? (
          <div className="flex flex-col gap-3 rounded-card bg-tint px-4 py-3.5">
            <p className="text-small">No bookings yet. Pick a date to see who is free.</p>
            <ButtonLink href="/" variant="secondary">
              Pick a date
            </ButtonLink>
          </div>
        ) : (
          <ul className="flex flex-col">
            {rows.map(({ b, p }) => (
              <li key={b.id} className="border-b border-line py-3.5">
                <Link href={`/bookings/${b.code}`} className="flex items-center justify-between gap-3 no-underline">
                  <span className="flex flex-col">
                    <span className="text-body font-bold">{p.displayName}</span>
                    <span className="text-meta text-stone">
                      {bsDayMonth(b.day)} · {b.packageName} · {b.code}
                    </span>
                  </span>
                  <span className="text-small font-semibold">{b.status === "held" ? "Pay to lock" : b.status === "confirmed" ? "Locked" : b.status}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
      <BottomNav role="client" active="bookings" />
    </>
  );
}
