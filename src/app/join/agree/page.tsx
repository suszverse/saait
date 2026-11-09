import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { SevenRules } from "@/components/legal/terms-body";
import { ChevronLeftIcon } from "@/components/ui";
import { loadTerms } from "@/lib/terms";
import { requireUser } from "@/server/auth/guards";
import { providerForUser } from "@/server/provider-account";
import { AgreeForm, type JoinKind } from "./agree-form";

export const metadata: Metadata = { title: "Agree to how Saait works" };

const KINDS = ["client", "studio", "freelancer"] as const satisfies readonly JoinKind[];

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const NOUN: Record<JoinKind, string> = { client: "client", studio: "business", freelancer: "freelancer" };

function isKind(v: unknown): v is JoinKind {
  return typeof v === "string" && (KINDS as readonly string[]).includes(v);
}

/** Same-site relative paths only; anything else is dropped. */
function safeNext(v: unknown): string | undefined {
  return typeof v === "string" && /^\/(?!\/)[\w\-/?=&%.+,]*$/.test(v) ? v : undefined;
}

/**
 * Figma J2 "Join: agree to how Saait works". Signed-out visitors go to log in
 * and come back here with the same `kind`. An existing provider sent here by
 * the login flow (no `kind` in the URL) is addressed by the kind on record.
 */
export default async function AgreePage({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const sp = await searchParams;
  const kindParam = isKind(sp.kind) ? sp.kind : undefined;
  const next = safeNext(sp.next);
  const user = await requireUser(kindParam ? `/join/agree?kind=${kindParam}` : next ? `/join/agree?next=${encodeURIComponent(next)}` : "/join/agree");

  let kind: JoinKind = kindParam ?? "client";
  if (!kindParam && user.role === "provider") {
    const profile = await providerForUser(user.id);
    if (profile?.kind === "studio" || profile?.kind === "freelancer") kind = profile.kind;
  }

  const terms = loadTerms();
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-form flex-col gap-6 px-gutter pt-14 pb-10 md:pt-10">
      <Link href={kindParam ? "/join" : "/"} aria-label="Back" className="-ml-3 flex size-11 items-center justify-center rounded-control">
        <ChevronLeftIcon size={22} />
      </Link>
      <div className="flex flex-col gap-2">
        <h1 className="text-title font-extrabold md:text-display">Before you join as a {NOUN[kind]}</h1>
        <p className="text-small text-stone">Seven rules keep bookings safe for everyone. You agree to them when you continue. The full terms are one page.</p>
      </div>
      <section aria-labelledby="seven-rules" className="rounded-card border border-line bg-ground p-5">
        <h2 id="seven-rules" className="sr-only">
          The seven rules
        </h2>
        <SevenRules rules={terms.rules} />
      </section>
      <AgreeForm kind={kind} version={terms.version} next={next} />
    </main>
  );
}
