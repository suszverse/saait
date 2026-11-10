"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import type { Theme } from "@/lib/theme";

type Role = "client" | "business" | "freelancer";

type Item = { label: string; href: string; also?: string[] };

/** Only routes that exist under src/app. Messages (/chat) joins once its page lands. */
const NAV: Record<Role, Item[]> = {
  client: [
    { label: "Dates", href: "/" },
    { label: "Browse", href: "/results", also: ["/p/"] },
    { label: "Bookings", href: "/bookings", also: ["/book/"] },
  ],
  business: [
    { label: "Today", href: "/business" },
    { label: "Rewards", href: "/rewards" },
  ],
  freelancer: [
    { label: "Today", href: "/crew" },
    { label: "Rewards", href: "/rewards" },
  ],
};

const HOME: Record<Role, string> = { client: "/", business: "/business", freelancer: "/crew" };
const LABEL: Record<Role, string> = { client: "Main", business: "Business", freelancer: "Freelancer" };

function isActive(item: Item, path: string) {
  if (item.href === "/") return path === "/";
  return [item.href, ...(item.also ?? [])].some((h) => (h.endsWith("/") ? path.startsWith(h) : path === h || path.startsWith(`${h}/`)));
}

type Props = {
  role: Role;
  name?: string;
  theme: Theme;
  signedIn: boolean;
  creditPill?: ReactNode;
  levelBadge?: ReactNode;
};

/** Desktop header, 72 px. Phone widths use BottomNav instead. */
export function WebHeader({ role, name, theme, signedIn, creditPill, levelBadge }: Props) {
  const path = usePathname();
  return (
    <header className="hidden h-18 border-b border-line bg-ground md:block">
      <div className="mx-auto flex h-full max-w-page items-center justify-between gap-6 px-gutter-desktop">
        <div className="flex items-center gap-8">
          <Link href={HOME[role]} className="text-brand font-extrabold text-ink no-underline">
            Saait
          </Link>
          <nav aria-label={LABEL[role]} className="flex items-center gap-1">
            {NAV[role].map((item) => {
              const on = isActive(item, path);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={on ? "page" : undefined}
                  className={`rounded-control px-3 py-2.5 text-label font-semibold no-underline ${on ? "bg-tint text-ink" : "text-stone hover:text-ink"}`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle value={theme} compact signedIn={signedIn} className="bg-tint" />
          {creditPill}
          {levelBadge}
          {name ? <span className="text-small font-semibold text-ink">{name}</span> : null}
        </div>
      </div>
    </header>
  );
}
