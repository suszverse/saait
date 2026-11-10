import type { Metadata } from "next";
import Link from "next/link";
import { CheckIcon, ChevronLeftIcon } from "@/components/ui";
import { parseReferralCode } from "@/server/rewards/referrals";

export const metadata: Metadata = { title: "Join Saait" };

/**
 * Figma J1 "Join: choose your account". Public, no session read, no client
 * JS: each card is a link that carries the chosen kind to the agreement
 * screen. There is no Sindoor button here because nothing is committed yet;
 * the one Primary action of the flow is "Agree and continue" on J2.
 */
const CHOICES: { kind: "client" | "studio" | "freelancer"; title: string; lines: [string, string, string] }[] = [
  {
    kind: "client",
    title: "I am booking a date",
    lines: ["Lock a date with a deposit; the balance goes to the business", "Every booking is guaranteed with a vetted backup", "Verified businesses only, fixed packages, no bidding"],
  },
  {
    kind: "studio",
    title: "I run a studio or production house",
    lines: ["Publish fixed packages and a calendar", "Deposits held for you until the booking is confirmed", "Hire private crew for the days you are full"],
  },
  {
    kind: "freelancer",
    title: "I am a freelancer",
    lines: ["Businesses hire you as crew for their bookings", "Your name and number stay private", "Build a record on Saait that grows your level"],
  },
];

export default async function JoinPage({ searchParams }: PageProps<"/join">) {
  // A shared link is /join?ref=CODE. It rides on every card link and on to the
  // login flow, which records it when the new user's row is first created.
  const sp = await searchParams;
  const ref = parseReferralCode(sp.ref);
  const refQuery = ref ? `&ref=${ref}` : "";
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-form flex-col gap-6 px-gutter pt-14 pb-10 md:pt-10">
      <Link href="/" aria-label="Back" className="-ml-3 flex size-11 items-center justify-center rounded-control">
        <ChevronLeftIcon size={22} />
      </Link>
      <div className="flex flex-col gap-1">
        <h1 className="text-title font-extrabold md:text-display">Join Saait</h1>
        <p className="text-small text-stone">Choose how you will use Saait. You can add a second role later from Settings.</p>
      </div>

      <nav aria-label="Account type" className="flex flex-col gap-3">
        {CHOICES.map((c) => (
          <Link
            key={c.kind}
            href={`/join/agree?kind=${c.kind}${refQuery}`}
            className="flex flex-col gap-3 rounded-card border border-line bg-ground p-5 no-underline transition-colors hover:bg-tint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            <span className="text-heading font-bold text-ink">{c.title}</span>
            <ul role="list" className="flex flex-col gap-2 p-0">
              {c.lines.map((line) => (
                <li key={line} className="grid grid-cols-[20px_minmax(0,1fr)] items-start gap-x-2 text-small text-stone">
                  <CheckIcon size={18} className="mt-px text-teal" aria-hidden="true" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </Link>
        ))}
      </nav>

      <p className="rounded-card bg-tint p-4 text-small text-stone">
        Your name and number stay private: businesses see your work and your record on Saait, and clients see the business they book. Numbers are
        shared only 48 hours before the event, on the booking page.
      </p>

      <p className="text-small text-stone">
        Already on Saait?{" "}
        <Link href={ref ? `/login?next=${encodeURIComponent(`/join/agree?ref=${ref}`)}` : "/login"} className="font-semibold text-ink">
          Sign in
        </Link>
      </p>
    </main>
  );
}
