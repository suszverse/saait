import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ChatBubble, SAFETY_COPY, SystemLine } from "@/components/chat/chat-bubble";
import { Composer } from "@/components/chat/composer";
import { buttonClass, ChevronLeftIcon } from "@/components/ui";
import { bsDayMonth, isIsoDate } from "@/lib/nepali-date";
import { requireUser } from "@/server/auth/guards";
import { ChatError, listThread, listThreads } from "@/server/chat/service";
import { db } from "@/server/db";
import { getVerifiedProvider } from "@/server/providers";

export const metadata: Metadata = { title: "Conversation" };

const when = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kathmandu", day: "numeric", month: "short" });

type ThreadRow = Awaited<ReturnType<typeof listThreads>>[number];

function about(t: ThreadRow): string {
  if (t.kind === "business_crew") return "Crew job";
  return t.day && isIsoDate(t.day) ? `About ${bsDayMonth(t.day)}` : "General question";
}

/**
 * Figma C4 / F2 conversation. Desktop: thread list (300 px), conversation,
 * context card. Phone: the conversation alone, composer pinned below.
 * Only the thread's two parties get past listThread; anyone else sees 404.
 */
export default async function ChatThreadPage({ params, searchParams }: PageProps<"/chat/[id]">) {
  await connection();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const user = await requireUser(`/chat/${id}`);
  const viewer = { id: user.id, role: user.role };

  let messages;
  try {
    messages = await listThread(db(), viewer, id);
  } catch (e) {
    if (e instanceof ChatError && (e.code === "forbidden" || e.code === "not_found")) notFound();
    throw e;
  }
  const threads = await listThreads(db(), viewer);
  const thread = threads.find((t) => t.id === id);
  if (!thread) notFound();

  // The slug in the URL only becomes a link when it names the business this thread is with.
  const slug = typeof sp.p === "string" ? sp.p : null;
  const provider = slug ? await getVerifiedProvider(db(), slug) : null;
  const profileHref = provider && provider.displayName === thread.title && thread.kind === "client_business" ? `/p/${provider.slug}` : null;

  const paused = user.chatPausedUntil != null && user.chatPausedUntil > new Date();

  return (
    <>
      <header className="border-b border-line bg-ground">
        <div className="mx-auto flex h-14 max-w-page items-center gap-2 px-gutter md:h-16 md:px-gutter-desktop">
          <Link href="/chat" className="-ml-3 flex min-h-11 items-center gap-1 rounded-control px-3 text-small font-semibold no-underline md:hidden">
            <ChevronLeftIcon size={18} />
            <span className="sr-only">Back to messages</span>
          </Link>
          <Link href="/" className="hidden text-brand font-extrabold no-underline md:block">
            Saait
          </Link>
          <div className="flex min-w-0 flex-col md:hidden">
            <span className="truncate text-body font-bold">{thread.title}</span>
            <span className="text-micro text-stone">{about(thread)}</span>
          </div>
        </div>
      </header>
      <main className="mx-auto flex h-[calc(100dvh-3.5rem)] w-full max-w-page flex-col md:grid md:h-[calc(100dvh-4rem)] md:grid-cols-[300px_minmax(0,1fr)] md:px-gutter-desktop lg:grid-cols-[300px_minmax(0,1fr)_280px]">
        <nav aria-label="Conversations" className="hidden flex-col gap-3 overflow-y-auto border-r border-line pt-6 pr-5 pb-10 md:flex">
          <h2 className="text-heading font-bold">Messages</h2>
          <ul className="-mx-3 flex flex-col">
            {threads.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/chat/${t.id}`}
                  aria-current={t.id === id ? "page" : undefined}
                  className={`flex min-h-15 flex-col justify-center gap-0.5 rounded-control px-3 py-2.5 no-underline hover:bg-tint ${t.id === id ? "bg-tint" : ""}`}
                >
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-body font-bold">{t.title}</span>
                    <time dateTime={t.lastMessageAt.toISOString()} className="shrink-0 text-micro text-stone">
                      {when.format(t.lastMessageAt)}
                    </time>
                  </span>
                  <span className="text-meta text-stone">{about(t)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <section aria-labelledby="conversation-heading" className="flex min-h-0 flex-1 flex-col">
          <h1 id="conversation-heading" className="sr-only md:not-sr-only md:border-b md:border-line md:px-5 md:py-4 md:text-heading md:font-bold">
            {thread.title}
          </h1>
          {/* Reversed so the newest message is in view on load without script. */}
          <div role="log" tabIndex={0} aria-label={`Messages with ${thread.title}`} className="flex min-h-0 flex-1 flex-col-reverse overflow-y-auto focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink">
            <ol className="flex flex-col gap-3 px-gutter py-4 md:px-5">
              <SystemLine />
              {messages.map((m) => (
                <ChatBubble
                  key={m.id}
                  mine={m.senderId === user.id}
                  message={{
                    id: m.id,
                    threadId: id,
                    body: m.body,
                    status: m.status,
                    reason: m.reason,
                    attachmentKey: m.attachmentKey,
                    appealedAt: m.appealedAt,
                    createdAt: m.createdAt,
                  }}
                />
              ))}
            </ol>
          </div>
          <Composer threadId={id} paused={paused} />
        </section>

        <aside aria-label="About this conversation" className="hidden pt-6 pl-5 lg:block">
          <div className="flex flex-col gap-3 rounded-card border border-line p-5">
            <p className="text-heading font-bold">{thread.title}</p>
            <p className="text-small text-stone">{about(thread)}</p>
            <p className="text-meta text-stone">{SAFETY_COPY}</p>
            {profileHref && (
              <Link href={profileHref} className={buttonClass("secondary", "md", "no-underline")}>
                See packages
              </Link>
            )}
          </div>
        </aside>
      </main>
    </>
  );
}
