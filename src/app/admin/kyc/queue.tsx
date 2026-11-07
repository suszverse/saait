import Link from "next/link";
import type { queue } from "@/server/kyc";

type Q = Awaited<ReturnType<typeof queue>>;

function age(d: Date) {
  const h = Math.max(1, Math.round((Date.now() - d.getTime()) / 3_600_000));
  return h < 24 ? `${h} hour${h === 1 ? "" : "s"}` : `${Math.floor(h / 24)} day${h >= 48 ? "s" : ""} ${h % 24} hours`;
}

export function Queue({ q, selected }: { q: Q; selected?: string }) {
  if (q.items.length === 0) return <p className="rounded-card border border-line bg-white px-4 py-3.5 text-small">Nothing waiting. New submissions appear here.</p>;
  return (
    <ul className="overflow-hidden rounded-card border border-line bg-white">
      {q.items.map((i) => {
        const tag = i.reverify ? ["Re-verify", "bg-marigold-tint text-marigold-text"] : i.resubmitted ? ["Resubmitted", "bg-sindoor-tint text-sindoor"] : i.kind === "studio" ? ["Studio", "bg-tint text-stone"] : ["Submitted", "bg-tint text-stone"];
        return (
          <li key={i.id} className="border-b border-line last:border-b-0">
            <Link
              href={`/admin/kyc/${i.id}`}
              aria-current={i.id === selected ? "true" : undefined}
              className={`flex flex-col gap-1 px-4 py-3.5 no-underline ${i.id === selected ? "bg-tint" : "bg-white hover:bg-tint"}`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="truncate text-label font-bold">{i.name}</span>
                <span className={`inline-flex h-5.5 shrink-0 items-center rounded-chip px-2 text-nano font-bold ${tag[1]}`}>{tag[0]}</span>
              </span>
              <span className="text-meta text-stone">
                {i.kind === "studio" ? "Studio" : "Freelancer"} · {i.city} · {age(i.submittedAt)}
                {i.status === "under_review" ? " · in review" : ""}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
