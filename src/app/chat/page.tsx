import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { ChevronLeftIcon } from "@/components/ui";
import { bsDayMonth, isIsoDate } from "@/lib/nepali-date";
import { requireUser } from "@/server/auth/guards";
import { listThreads } from "@/server/chat/service";
import { db } from "@/server/db";

export const metadata: Metadata = { title: "Messages" };

const when = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kathmandu", day: "numeric", month: "short" });

/** What a failed "Message" press on a business page comes back as. */
const OPEN_NOTES: Record<string, string> = {
  not_found: "That business could not be found.",
  forbidden: "You can't message this account.",
};

/**
 * Figma C4 / F2 thread list. On a phone it is the whole screen; on desktop it
 * is the 300 px left column beside an empty conversation pane.
 */
export default async function ChatListPage({ searchParams }: PageProps<"/chat">) {
  await connection();
  const user = await requireUser("/chat");
  const [threads, sp] = await Promise.all([listThreads(db(), { id: user.id, role: user.role }), searchParams]);
  const note = typeof sp.open === "string" ? (OPEN_NOTES[sp.open] ?? "That conversation could not be opened. Try again.") : null;

  return (
    <>
      <header className="border-b border-line bg-ground">
        <div className="mx-auto flex h-14 max-w-page items-center justify-between px-gutter md:h-16 md:px-gutter-desktop">
          <Link href="/" className="text-brand font-extrabold no-underline">
            Saait
          </Link>
          <Link href="/" className="-mr-3 flex min-h-11 items-center gap-1 rounded-control px-3 text-small font-semibold no-underline">
            <ChevronLeftIcon size={18} />
            Back
          </Link>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-page flex-1 flex-col md:grid md:h-[calc(100dvh-4rem)] md:grid-cols-[300px_minmax(0,1fr)] md:px-gutter-desktop">
        <section aria-labelledby="threads-heading" className="flex flex-col gap-3 px-gutter pt-6 pb-10 md:overflow-y-auto md:border-r md:border-line md:pr-5 md:pl-0">
          <h1 id="threads-heading" className="text-title font-extrabold">
            Messages
          </h1>
          {note && (
            <p role="status" className="rounded-control bg-tint px-3.5 py-2.5 text-small font-semibold text-ink">
              {note}
            </p>
          )}
          {threads.length === 0 ? (
            <p className="text-body text-stone">No conversations yet. Message a business from its page.</p>
          ) : (
            <ThreadList threads={threads} />
          )}
        </section>
        <div aria-hidden="true" className="hidden items-center justify-center md:flex">
          <p className="text-small text-stone">Choose a conversation.</p>
        </div>
      </main>
    </>
  );
}

type ThreadRow = Awaited<ReturnType<typeof listThreads>>[number];

function ThreadList({ threads }: { threads: ThreadRow[] }) {
  return (
    <ul className="-mx-3 flex flex-col">
      {threads.map((t) => (
        <li key={t.id}>
          <Link href={`/chat/${t.id}`} className="flex min-h-15 flex-col justify-center gap-0.5 rounded-control px-3 py-2.5 no-underline hover:bg-tint">
            <span className="flex items-baseline justify-between gap-3">
              <span className="truncate text-body font-bold">{t.title}</span>
              <time dateTime={t.lastMessageAt.toISOString()} className="shrink-0 text-micro text-stone">
                {when.format(t.lastMessageAt)}
              </time>
            </span>
            <span className="text-meta text-stone">
              {t.kind === "business_crew" ? "Crew job" : t.day && isIsoDate(t.day) ? `About ${bsDayMonth(t.day)}` : "General question"}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
