import Link from "next/link";
import { connection } from "next/server";
import { requireProviderKind } from "@/server/auth/guards";

/** Minimal shell for the crew area; the full header lands with the crew nav task. */
export default async function CrewLayout({ children }: LayoutProps<"/crew">) {
  await connection();
  const { profile } = await requireProviderKind("freelancer", "/crew");
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-line bg-ground">
        <div className="mx-auto flex h-14 max-w-page items-center justify-between px-gutter md:h-16 md:px-gutter-desktop">
          <Link href="/crew" className="text-brand font-extrabold no-underline">
            Saait
          </Link>
          <span className="text-small font-semibold text-stone">{profile.alias ?? profile.displayName}</span>
        </div>
      </header>
      {children}
    </div>
  );
}
