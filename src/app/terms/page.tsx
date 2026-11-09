import type { Metadata } from "next";
import Link from "next/link";
import { TermsBody } from "@/components/legal/terms-body";
import { ChevronLeftIcon } from "@/components/ui";
import { loadTerms } from "@/lib/terms";

export const metadata: Metadata = { title: "Terms, privacy and chat rules" };

/** Public page: no session read, no client JS. */
export default function TermsPage() {
  const terms = loadTerms();
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
      <main className="mx-auto w-full max-w-page px-gutter pt-8 pb-16 md:px-gutter-desktop md:pt-12">
        <TermsBody terms={terms} />
      </main>
    </>
  );
}
