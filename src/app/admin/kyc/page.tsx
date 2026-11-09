import type { Metadata } from "next";
import { connection } from "next/server";
import { requireRole } from "@/server/auth/guards";
import { db } from "@/server/db";
import { queue } from "@/server/kyc";
import { Queue } from "./queue";

export const metadata: Metadata = { title: "Verification queue" };

export default async function KycQueuePage() {
  await connection();
  // Every page checks the role itself: a layout's redirect does not stop the
  // page's own data from rendering into the response.
  await requireRole(["operator", "admin"], "/admin/kyc");
  const q = await queue(db());
  const oldest = q.items[0]?.submittedAt;
  return (
    <main className="flex flex-col gap-5 px-gutter py-7 md:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <h1 className="text-title font-extrabold">Verification queue</h1>
          <p className="text-small text-stone">
            {q.total} waiting{oldest ? ` · oldest since ${oldest.toLocaleString("en-GB", { timeZone: "Asia/Kathmandu", dateStyle: "medium", timeStyle: "short" })}` : ""} · target is 2 working days
          </p>
        </div>
        <ul className="flex flex-wrap gap-2 text-meta font-semibold" aria-label="Counts">
          <li className="inline-flex h-9 items-center rounded-chip bg-ink px-3 text-on-accent">Submitted {q.counts.submitted}</li>
          <li className="inline-flex h-9 items-center rounded-chip border border-line bg-ground px-3">Resubmitted {q.counts.resubmitted}</li>
          <li className="inline-flex h-9 items-center rounded-chip border border-line bg-ground px-3">Re-verification due {q.counts.reverification_due}</li>
        </ul>
      </header>
      <div className="max-w-[360px]">
        <Queue q={q} />
      </div>
    </main>
  );
}
