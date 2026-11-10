import { appealAction } from "@/app/chat/[id]/actions";
import { CameraIcon } from "@/components/ui";

/** Shared by the composer and the conversation page so the pause reads the same everywhere. */
export const PAUSED_COPY = "Chat is paused for 24 hours after several messages were not sent.";
export const SAFETY_COPY =
  "Chat is checked for your safety. Phone numbers are shared 48 hours before the event, once the date is locked.";

const time = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kathmandu", hour: "numeric", minute: "2-digit" });

export type BubbleMessage = {
  id: string;
  threadId: string;
  body: string;
  status: "delivered" | "cleared" | "held";
  reason: string | null;
  attachmentKey: string | null;
  appealedAt: Date | null;
  createdAt: Date;
};

/** A delivered photo has no public route yet, so it reads as a labelled placeholder rather than a broken image. */
function Content({ m }: { m: BubbleMessage }) {
  if (m.body) return <p className="text-body break-words whitespace-pre-wrap">{m.body}</p>;
  return (
    <p className="flex items-center gap-1.5 text-body">
      <CameraIcon size={18} />
      Photo
    </p>
  );
}

function Time({ at, className = "" }: { at: Date; className?: string }) {
  return (
    <time dateTime={at.toISOString()} className={`text-micro text-stone ${className}`}>
      {time.format(at)}
    </time>
  );
}

/**
 * Figma C4 bubbles. Incoming sits on Tint; outgoing is Ink on Ground with a
 * one-pixel Line. A message that was not sent is shown only to its sender,
 * with a dashed border, the reason, and one way to ask for a second look.
 */
export function ChatBubble({ message: m, mine }: { message: BubbleMessage; mine: boolean }) {
  if (m.status === "held") {
    return (
      <li className="flex flex-col items-end gap-1">
        <div className="flex max-w-[85%] flex-col gap-1.5 rounded-card border border-dashed border-stone bg-ground px-3.5 py-2.5 text-ink md:max-w-[70%]">
          <Content m={m} />
          <p className="text-meta font-bold text-sindoor">Not sent</p>
          {m.reason && <p className="text-meta text-stone">{m.reason}</p>}
          {m.appealedAt ? (
            <p className="text-meta font-semibold text-ink">Sent for a second look</p>
          ) : (
            <form action={appealAction}>
              <input type="hidden" name="messageId" value={m.id} />
              <input type="hidden" name="threadId" value={m.threadId} />
              <button type="submit" className="-mx-1 min-h-11 rounded-control px-1 text-left text-meta font-bold text-ink underline underline-offset-2 hover:bg-tint">
                This isn&apos;t contact info
              </button>
            </form>
          )}
        </div>
        <Time at={m.createdAt} />
      </li>
    );
  }

  return (
    <li className={`flex flex-col gap-1 ${mine ? "items-end" : "items-start"}`}>
      <div
        className={`max-w-[85%] rounded-card px-3.5 py-2.5 text-ink md:max-w-[70%] ${mine ? "border border-line bg-ground" : "bg-tint"}`}
      >
        <span className="sr-only">{mine ? "You: " : "They wrote: "}</span>
        <Content m={m} />
      </div>
      <Time at={m.createdAt} />
    </li>
  );
}

/** The centred Small Stone line that opens every conversation. */
export function SystemLine() {
  return (
    <li className="px-4 py-2 text-center text-small text-stone">
      {SAFETY_COPY}
    </li>
  );
}
