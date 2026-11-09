import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink, ChevronLeftIcon } from "@/components/ui";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { requireUser } from "@/server/auth/guards";

export const metadata: Metadata = { title: "Settings" };

/** Settings (Figma S1): appearance and the user's data. No Sindoor on this page. */
export default async function SettingsPage() {
  const user = await requireUser("/settings");

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
      <main className="mx-auto flex w-full max-w-form flex-col gap-5 px-gutter pt-6 pb-10 md:max-w-[560px] md:pt-10">
        <h1 className="text-title font-extrabold">Settings</h1>

        <section className="flex flex-col gap-4 rounded-card border border-line bg-ground p-5" aria-labelledby="appearance">
          <div className="flex flex-col gap-1">
            <h2 id="appearance" className="text-heading font-bold">
              Appearance
            </h2>
            <p className="text-small text-stone">
              Saait follows your device by default. Pick Light or Dark to override it; the choice is saved to your account and used on every
              device you sign in to.
            </p>
          </div>
          <ThemeToggle value={user.theme} signedIn />
        </section>

        <section className="flex flex-col gap-4 rounded-card border border-line bg-ground p-5" aria-labelledby="your-data">
          <div className="flex flex-col gap-1">
            <h2 id="your-data" className="text-heading font-bold">
              Your data
            </h2>
            <p className="text-small text-stone">
              Download everything Saait holds about you, or delete your account. Chat is kept 12 months after each event, then deleted; booking
              and payment records stay as tax law requires.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <ButtonLink variant="secondary" size="md" href="mailto:privacy@saait.app?subject=Download%20my%20data">
              Download my data
            </ButtonLink>
            <ButtonLink variant="tertiary" size="md" href="mailto:privacy@saait.app?subject=Delete%20my%20account">
              Delete account
            </ButtonLink>
          </div>
        </section>
      </main>
    </>
  );
}
