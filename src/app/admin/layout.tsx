import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { signOut } from "@/app/login/actions";
import { requireRole } from "@/server/auth/guards";
import { db } from "@/server/db";
import { queue } from "@/server/kyc";

export const metadata: Metadata = { title: { default: "Operator desk", template: "%s · Saait desk" } };

/** Operator desk (Figma screen 8). Phase 1 ships Verification; the rest are placeholders for later phases. */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await connection();
  const user = await requireRole(["operator", "admin"], "/admin/kyc");
  const q = await queue(db());
  const items: [string, string, number | null, boolean][] = [
    ["Verification", "/admin/kyc", q.total, true],
    ["Urgent requests", "", null, false],
    ["Bookings", "", null, false],
    ["Disputes", "", null, false],
    ["Payouts and TDS", "", null, false],
    ["Providers", "", null, false],
    ["Wedding dates", "", null, false],
    ["Settings", "", null, false],
  ];
  return (
    <div className="flex min-h-dvh flex-col bg-tint md:flex-row">
      <nav aria-label="Admin" className="flex flex-col gap-1 border-b border-line bg-ground px-4 py-5 md:w-60 md:shrink-0 md:border-r md:border-b-0 md:py-7">
        <div className="flex flex-col gap-0.5 px-3 pb-5">
          <span className="text-brand font-extrabold">Saait</span>
          <span className="text-meta text-stone">Operator · {user.name ?? user.phone.replace("+977", "")}</span>
        </div>
        {items.map(([label, href, count, live]) =>
          live ? (
            <Link key={label} href={href} aria-current="page" className="flex h-11 items-center justify-between rounded-control bg-tint px-3 text-label font-bold no-underline">
              <span>{label}</span>
              {count ? <span className="inline-flex h-5.5 items-center rounded-chip bg-ink px-2 text-micro font-normal text-on-accent">{count}</span> : null}
            </Link>
          ) : (
            <span key={label} className="hidden h-11 items-center justify-between px-3 text-label font-semibold text-stone md:flex" title="Coming in a later phase">
              {label}
              <span className="text-micro font-normal">Later</span>
            </span>
          ),
        )}
        <form action={signOut} className="px-3 pt-3 md:mt-auto md:pt-6">
          <button type="submit" className="text-small font-semibold text-stone underline">
            Sign out
          </button>
        </form>
      </nav>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
