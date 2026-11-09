"use client";

import { startTransition, useActionState } from "react";
import { Button } from "@/components/ui";
import type { QueueItem } from "@/server/chat/moderation";
import { decideFlag, type FlagState } from "./actions";

function ago(d: Date) {
  const m = Math.max(1, Math.round((Date.now() - d.getTime()) / 60_000));
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const days = Math.floor(h / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/**
 * One held message with its thread context and the two decisions. Sender
 * messages (same id as the flagged one) read as "Sender", the other side as
 * "Other side"; the queue does not name the recipient.
 */
export function FlagRow({ item }: { item: QueueItem }) {
  const [state, action, pending] = useActionState(decideFlag, {} as FlagState);
  const who = item.sender.name?.trim() || item.sender.phone;
  const meta = [`Layer ${item.layer ?? "?"}`, ago(item.createdAt), item.appealed ? "appealed" : null].filter(Boolean).join(" · ");
  return (
    <li className="flex flex-col gap-3 px-4 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-label font-bold">
          {who}
          {item.sender.name?.trim() ? <span className="ml-2 text-meta font-normal text-stone">{item.sender.phone}</span> : null}
        </p>
        <p className="text-meta text-stone">
          {meta}
          {item.appealed && <span className="ml-2 inline-flex h-5.5 items-center rounded-chip bg-marigold-tint px-2 text-nano font-bold text-marigold-text">Appealed</span>}
        </p>
      </div>

      {item.context.length > 0 && (
        <ol className="flex flex-col gap-1 border-l-2 border-line pl-3 text-meta text-stone" aria-label="Earlier messages in this thread">
          {item.context.map((c) => (
            <li key={c.id} className="truncate">
              <span className="font-semibold">{c.senderId === item.sender.id ? "Sender" : "Other side"}:</span> {c.body}
              {c.status === "held" ? " (held)" : ""}
            </li>
          ))}
        </ol>
      )}

      <div className="flex flex-col gap-1">
        <p className="text-body whitespace-pre-wrap break-words">{item.body}</p>
        {item.reason && <p className="text-small text-stone">{item.reason}</p>}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
          startTransition(() => action(fd));
        }}
        className="flex flex-wrap items-center gap-2.5"
      >
        <input type="hidden" name="messageId" value={item.id} />
        <Button type="submit" name="decision" value="clear" variant="secondary" size="md" disabled={pending}>
          Clear
        </Button>
        <Button type="submit" name="decision" value="confirm" variant="primary" size="md" disabled={pending}>
          Confirm
        </Button>
        {state.error && (
          <p role="alert" className="text-meta text-sindoor">
            {state.error}
          </p>
        )}
      </form>
    </li>
  );
}
