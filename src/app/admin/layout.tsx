import type { Metadata } from "next";
import { connection } from "next/server";
import { signOut } from "@/app/login/actions";
import { requireRole } from "@/server/auth/guards";
import { heldCount } from "@/server/chat/moderation";
import { db } from "@/server/db";
import { queue } from "@/server/kyc";
import { countPendingPortfolio } from "@/server/portfolio";
import { reportCounts } from "@/server/signals";
import { AdminNav, type AdminNavItem } from "./admin-nav";

export const metadata: Metadata = { title: { default: "Operator desk", template: "%s · Saait desk" } };

/** Operator desk (Figma screen 8). Live: Verification, Flagged messages, Signals, Portfolio; the rest are placeholders for later phases. */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await connection();
  const user = await requireRole(["operator", "admin"], "/admin/kyc");
  const database = db();
  const [q, held, reports, pendingPortfolio] = await Promise.all([queue(database), heldCount(database), reportCounts(database), countPendingPortfolio(database)]);
  const openReports = reports.reduce((sum, r) => sum + r.open, 0);
  const items: AdminNavItem[] = [
    { label: "Verification", href: "/admin/kyc", count: q.total },
    { label: "Flagged messages", href: "/admin/chat", count: held },
    { label: "Signals", href: "/admin/signals", count: openReports },
    { label: "Portfolio", href: "/admin/portfolio", count: pendingPortfolio },
    { label: "Urgent requests", href: "" },
    { label: "Bookings", href: "" },
    { label: "Disputes", href: "" },
    { label: "Payouts and TDS", href: "" },
    { label: "Providers", href: "" },
    { label: "Wedding dates", href: "" },
    { label: "Settings", href: "" },
  ];
  return (
    <div className="flex min-h-dvh flex-col bg-tint md:flex-row">
      <nav aria-label="Admin" className="flex flex-col gap-1 border-b border-line bg-ground px-4 py-5 md:w-60 md:shrink-0 md:border-r md:border-b-0 md:py-7">
        <div className="flex flex-col gap-0.5 px-3 pb-5">
          <span className="text-brand font-extrabold">Saait</span>
          <span className="text-meta text-stone">Operator · {user.name ?? user.phone.replace("+977", "")}</span>
        </div>
        <AdminNav items={items} />
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
