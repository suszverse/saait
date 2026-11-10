import { Button, CloseIcon } from "@/components/ui";
import { UploadSlot } from "./upload-slot";

export type PortfolioTile = {
  id: string;
  mediaKind: "photo" | "clip";
  status: "pending" | "approved" | "held";
  reason: string | null;
  durationSeconds: number | null;
};

const duration = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/**
 * One portfolio section (photos or clips) for the owner: counter, add button,
 * tiles and dashed slots for what is left. Server component so both editors
 * can use it; removal is passed in as a form action. `nextLimit` carries the
 * "20 at Proven" hint for freelancers.
 */
export function PortfolioGrid({
  items,
  limit,
  nextLimit,
  kind,
  label,
  removeAction,
}: {
  items: PortfolioTile[];
  limit: number;
  nextLimit?: number | null;
  kind: "photo" | "clip";
  /** Plural noun for headings and buttons, e.g. "Photos". */
  label: string;
  removeAction: (formData: FormData) => void | Promise<void>;
}) {
  const own = items.filter((i) => i.mediaKind === kind);
  const left = Math.max(0, limit - own.length);
  const noun = label.toLowerCase();
  return (
    <section aria-labelledby={`pg-${kind}`} className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-0.5">
          <h2 id={`pg-${kind}`} className="text-heading font-extrabold">
            {label} <span className="font-semibold text-stone">{own.length} of {limit}</span>
          </h2>
          {nextLimit && nextLimit > limit ? <p className="text-meta text-stone">{nextLimit} at the next level</p> : null}
        </div>
        <UploadSlot left={left} noun={noun} accept={kind === "photo" ? "image/jpeg,image/png,image/webp" : "video/mp4,video/quicktime"} />
      </div>
      <ul className="flex flex-wrap gap-3">
        {own.map((it, n) => (
          <li key={it.id} className="flex w-40 flex-col gap-1.5">
            <div className="relative h-30 w-40 overflow-hidden rounded-control border border-line bg-tint">
              {it.mediaKind === "photo" ? (
                // eslint-disable-next-line @next/next/no-img-element -- owner-only, encrypted store route
                <img src={`/media/${it.id}`} alt={`${label.replace(/s$/, "")} ${n + 1}`} width={160} height={120} className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-ink" aria-hidden>
                  <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                </span>
              )}
              {it.mediaKind === "clip" && it.durationSeconds != null ? (
                <span className="absolute right-1.5 bottom-1.5 rounded-chip bg-ink px-2 text-micro font-semibold text-on-accent">{duration(it.durationSeconds)}</span>
              ) : null}
              {it.status === "pending" ? (
                <span className="absolute top-1.5 left-1.5 rounded-chip bg-tint px-2 text-micro font-semibold text-ink">Checking</span>
              ) : null}
              <form action={removeAction} className="absolute top-1.5 right-1.5">
                <input type="hidden" name="id" value={it.id} />
                <Button type="submit" variant="tertiary" size="md" className="size-11 !px-0" aria-label={`Remove ${label.replace(/s$/, "").toLowerCase()} ${n + 1}`}>
                  <CloseIcon size={16} />
                </Button>
              </form>
            </div>
            {it.status === "held" ? <p className="text-meta text-sindoor">{it.reason ?? "Held for a closer look."}</p> : null}
          </li>
        ))}
        {Array.from({ length: left }, (_, i) => (
          <li key={`slot-${i}`} aria-hidden className="h-30 w-40 rounded-control border border-dashed border-line" />
        ))}
      </ul>
      <p className="sr-only">{left} {noun} slots left</p>
    </section>
  );
}
