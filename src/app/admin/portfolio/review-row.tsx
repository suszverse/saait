"use client";

import { startTransition, useActionState, useId, useState } from "react";
import { Button, TextField } from "@/components/ui";
import type { PendingPortfolioItem } from "./page";
import { reviewItem, type ReviewState } from "./actions";

function ago(d: Date) {
  const m = Math.max(1, Math.round((Date.now() - d.getTime()) / 60_000));
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const days = Math.floor(h / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function size(bytes: number | null) {
  if (bytes === null) return null;
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1000))} KB`;
}

function duration(seconds: number | null) {
  if (seconds === null) return null;
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * One pending upload with its preview and the two decisions. Approve is the
 * routine action; Hold is the destructive one and takes the single Sindoor
 * slot, with a required reason the provider will read.
 */
export function ReviewRow({ item }: { item: PendingPortfolioItem }) {
  const [state, action, pending] = useActionState(reviewItem, {} as ReviewState);
  const [holding, setHolding] = useState(false);
  const reasonId = useId();
  const src = `/media/${item.id}`;
  const meta = [
    item.mediaKind === "photo" ? "Photo" : "Clip",
    size(item.bytes),
    item.mediaKind === "clip" ? duration(item.durationSeconds) : null,
    ago(item.createdAt),
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <li className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:gap-4">
      <div className="shrink-0 overflow-hidden rounded-control border border-line bg-tint sm:w-40">
        {item.mediaKind === "photo" ? (
          // eslint-disable-next-line @next/next/no-img-element -- operator-only preview streamed from our own route
          <img src={src} alt={`Pending photo from ${item.providerName}`} className="aspect-[4/3] w-full object-cover" loading="lazy" />
        ) : (
          <video src={src} controls preload="metadata" muted playsInline className="aspect-[4/3] w-full bg-ink object-contain" aria-label={`Pending clip from ${item.providerName}`} />
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p className="text-label font-bold">
            {item.providerName}
            <span className="ml-2 text-meta font-normal text-stone">{item.providerKind === "studio" ? "Studio" : "Freelancer"}</span>
          </p>
          <p className="text-meta text-stone">{meta}</p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
            startTransition(() => action(fd));
          }}
          className="flex flex-col gap-3"
        >
          <input type="hidden" name="itemId" value={item.id} />
          {holding && (
            <TextField
              id={reasonId}
              name="reason"
              label="Reason for holding"
              helper="The provider reads this next to the held item."
              multiline
              required
              minLength={3}
              maxLength={500}
              autoFocus
              disabled={pending}
            />
          )}
          <div className="flex flex-wrap items-center gap-2.5">
            {holding ? (
              <>
                <Button type="button" variant="secondary" size="md" disabled={pending} onClick={() => setHolding(false)}>
                  Back
                </Button>
                <Button type="submit" name="decision" value="hold" variant="primary" size="md" disabled={pending}>
                  Hold
                </Button>
              </>
            ) : (
              <>
                <Button type="submit" name="decision" value="approve" variant="secondary" size="md" disabled={pending}>
                  Approve
                </Button>
                <Button type="button" variant="primary" size="md" disabled={pending} onClick={() => setHolding(true)}>
                  Hold
                </Button>
              </>
            )}
            {state.error && (
              <p role="alert" className="text-meta text-sindoor">
                {state.error}
              </p>
            )}
          </div>
        </form>
      </div>
    </li>
  );
}
