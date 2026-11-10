import type { Metadata } from "next";
import { connection } from "next/server";
import { requireRole } from "@/server/auth/guards";
import { db } from "@/server/db";
import { listPendingPortfolio } from "@/server/portfolio";
import { ReviewRow } from "./review-row";

export const metadata: Metadata = { title: "Portfolio review" };

export type PendingPortfolioItem = Awaited<ReturnType<typeof listPendingPortfolio>>[number];

export default async function PortfolioReviewPage() {
  await connection();
  // Every page checks the role itself: a layout's redirect does not stop the
  // page's own data from rendering into the response.
  const op = await requireRole(["operator", "admin"], "/admin/portfolio");
  const items = await listPendingPortfolio(db(), { id: op.id, role: op.role });
  return (
    <main className="flex flex-col gap-5 px-gutter py-7 md:px-8">
      <header className="flex flex-col gap-0.5">
        <h1 className="text-title font-extrabold">Portfolio review</h1>
        <p className="text-small text-stone">{items.length} waiting · Approve publishes the item; Hold keeps it off the profile with a reason the provider can read.</p>
      </header>
      <div className="max-w-[720px]">
        {items.length === 0 ? (
          <p className="rounded-card border border-line bg-ground px-4 py-3.5 text-small">Nothing waiting for review.</p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-ground">
            {items.map((i) => (
              <ReviewRow key={i.id} item={i} />
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
