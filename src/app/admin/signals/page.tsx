import type { Metadata } from "next";
import { connection } from "next/server";
import { bsDayMonthNp, gregorianShort } from "@/lib/nepali-date";
import { requireRole } from "@/server/auth/guards";
import { db } from "@/server/db";
import { leakageSignals, SIGNAL_WINDOW_DAYS } from "@/server/signals";

export const metadata: Metadata = { title: "Leakage signals" };

const KTM = { timeZone: "Asia/Kathmandu", dateStyle: "medium", timeStyle: "short" } as const;

/** "3 hours after" or "2 days after" the enquiry. */
function lag(from: Date, to: Date) {
  const h = Math.max(1, Math.round((to.getTime() - from.getTime()) / 3_600_000));
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} after`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? "" : "s"} after`;
}

/** Operator desk O2. Patterns that suggest a deal left Saait; nothing here acts on its own. */
export default async function SignalsPage() {
  await connection();
  // Every page checks the role itself: a layout's redirect does not stop the
  // page's own data from rendering into the response.
  await requireRole(["operator", "admin"], "/admin/signals");
  const { blocks, reports } = await leakageSignals(db());
  return (
    <main className="flex flex-col gap-7 px-gutter py-7 md:px-8">
      <header className="flex flex-col gap-0.5">
        <h1 className="text-title font-extrabold">Leakage signals</h1>
        <p className="text-small text-stone">Days blocked after a client asked about them, with no booking on Saait · last {SIGNAL_WINDOW_DAYS} days</p>
      </header>

      <section className="flex flex-col gap-3" aria-labelledby="blocks">
        <h2 id="blocks" className="text-label font-bold">
          Calendar blocks after an enquiry <span className="font-normal text-stone">· {blocks.length}</span>
        </h2>
        {blocks.length === 0 ? (
          <p className="rounded-card border border-line bg-ground px-4 py-3.5 text-small">No blocks after an enquiry in the last {SIGNAL_WINDOW_DAYS} days.</p>
        ) : (
          <div className="overflow-x-auto rounded-card border border-line bg-ground">
            <table className="w-full text-small">
              <thead className="text-meta text-stone">
                <tr className="border-b border-line text-left">
                  <th className="px-4 py-2.5 font-semibold">Business</th>
                  <th className="px-4 py-2.5 font-semibold">Client</th>
                  <th className="px-4 py-2.5 font-semibold">Date</th>
                  <th className="px-4 py-2.5 font-semibold">Enquired</th>
                  <th className="px-4 py-2.5 font-semibold">Blocked</th>
                </tr>
              </thead>
              <tbody>
                {blocks.map((b) => (
                  <tr key={b.thread.id} className="border-b border-line last:border-b-0">
                    <td className="px-4 py-3 font-bold">{b.provider.name}</td>
                    <td className="px-4 py-3">{b.client.name ?? b.client.phone.replace("+977", "")}</td>
                    <td className="px-4 py-3">
                      {bsDayMonthNp(b.day)} <span className="text-meta text-stone">· {gregorianShort(b.day)}</span>
                    </td>
                    <td className="px-4 py-3 text-stone">{b.enquiredAt.toLocaleString("en-GB", KTM)}</td>
                    <td className="px-4 py-3">
                      <span className="font-semibold text-marigold-text">{lag(b.enquiredAt, b.blockedAt)}</span>{" "}
                      <span className="text-meta text-stone">· {b.blockedAt.toLocaleString("en-GB", KTM)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="reports">
        <h2 id="reports" className="text-label font-bold">
          Open reports <span className="font-normal text-stone">· {reports.reduce((n, r) => n + r.open, 0)}</span>
        </h2>
        {reports.length === 0 ? (
          <p className="rounded-card border border-line bg-ground px-4 py-3.5 text-small">No open reports.</p>
        ) : (
          <ul className="max-w-[360px] overflow-hidden rounded-card border border-line bg-ground">
            {reports.map((r) => (
              <li key={r.provider.id} className="flex items-center justify-between gap-2 border-b border-line px-4 py-3.5 last:border-b-0">
                <span className="truncate text-label font-bold">{r.provider.name}</span>
                <span className="inline-flex h-5.5 shrink-0 items-center rounded-chip bg-ink px-2 text-micro text-on-accent">{r.open}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
