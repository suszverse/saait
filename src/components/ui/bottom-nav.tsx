"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { SVGProps } from "react";
import { CalendarIcon, HomeIcon, LockIcon, PackageIcon, SearchIcon, ShieldIcon, UserIcon } from "./icons";

type NavIconProps = Omit<SVGProps<SVGSVGElement>, "children"> & { size?: number };

function glyph(paths: React.ReactNode) {
  return function NavIcon({ size = 24, ...rest }: NavIconProps) {
    return (
      <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...rest}>
        {paths}
      </svg>
    );
  };
}

const ChatIcon = glyph(<path d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8l-5 4v-4H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" />);
const GiftIcon = glyph(<><rect x="3" y="8" width="18" height="4" rx="1" /><path d="M5 12v8h14v-8M12 8v12M12 8c-2.5 0-4-1-4-2.5S9.5 3 12 8zM12 8c2.5 0 4-1 4-2.5S14.5 3 12 8z" /></>);

const NAVS = {
  client: [
    { key: "dates", label: "Dates", href: "/", Icon: CalendarIcon },
    { key: "browse", label: "Browse", href: "/results", Icon: SearchIcon },
    { key: "bookings", label: "Bookings", href: "/bookings", Icon: LockIcon },
    { key: "messages", label: "Messages", href: "/chat", Icon: ChatIcon },
    { key: "rewards", label: "Rewards", href: "/rewards", Icon: GiftIcon },
  ],
  provider: [
    { key: "today", label: "Today", href: "/provider", Icon: HomeIcon },
    { key: "calendar", label: "Calendar", href: "/provider", Icon: CalendarIcon },
    { key: "packages", label: "Packages", href: "/provider", Icon: PackageIcon },
    { key: "account", label: "Account", href: "/provider/kyc", Icon: UserIcon },
  ],
  business: [
    { key: "today", label: "Today", href: "/business", Icon: HomeIcon },
    { key: "crew", label: "Crew", href: "/business/crew", Icon: UserIcon },
    { key: "profile", label: "Profile", href: "/business/profile", Icon: PackageIcon },
    { key: "reviews", label: "Reviews", href: "/business/reviews", Icon: ShieldIcon },
    { key: "messages", label: "Messages", href: "/chat", Icon: ChatIcon },
    { key: "rewards", label: "Rewards", href: "/rewards", Icon: GiftIcon },
  ],
  crew: [
    { key: "today", label: "Today", href: "/crew", Icon: HomeIcon },
    { key: "jobs", label: "Jobs", href: "/crew/jobs", Icon: CalendarIcon },
    { key: "profile", label: "Profile", href: "/crew/profile", Icon: UserIcon },
    { key: "messages", label: "Messages", href: "/chat", Icon: ChatIcon },
    { key: "rewards", label: "Rewards", href: "/rewards", Icon: GiftIcon },
  ],
} as const;

const LABELS: Record<keyof typeof NAVS, string> = { client: "Main", provider: "Provider", business: "Business", crew: "Freelancer" };
const HOME = { client: "/", provider: "/provider", business: "/business", crew: "/crew" } as const;

/** Key of the item whose href matches the path, when the caller did not pass one. */
function activeFor(role: keyof typeof NAVS, path: string) {
  // Longest matching href wins so /business/crew is not claimed by /business.
  const hits = NAVS[role].filter((n) => (n.href === "/" ? path === "/" : path === n.href || path.startsWith(`${n.href}/`)));
  return hits.sort((a, b) => b.href.length - a.href.length)[0]?.key;
}

export type NavRole = keyof typeof NAVS;

/**
 * Phone bottom navigation, 84 px with the home-indicator inset. On desktop
 * widths it is hidden; the site header carries the same links.
 */
export function BottomNav({ role, active }: { role: NavRole; active?: string }) {
  const path = usePathname();
  const current = active ?? activeFor(role, path);
  return (
    <nav
      aria-label={LABELS[role]}
      style={{ gridTemplateColumns: `repeat(${NAVS[role].length}, minmax(0, 1fr))` }}
      className="sticky bottom-0 z-10 grid h-21 border-t border-line bg-ground px-2 pt-2 pb-5 md:hidden"
    >
      {NAVS[role].map(({ key, label, href, Icon }) => {
        const on = key === current;
        return (
          <Link
            key={key}
            href={href}
            aria-current={on ? "page" : undefined}
            className={`flex flex-col items-center justify-center gap-0.75 text-micro font-semibold no-underline ${on ? "text-sindoor" : "text-stone"}`}
          >
            <Icon size={22} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Desktop header for the website; the phone uses BottomNav. */
export function SiteHeader({ role, active }: { role: NavRole; active: string }) {
  return (
    <header className="hidden border-b border-line bg-ground md:block">
      <div className="mx-auto flex h-16 max-w-page items-center justify-between px-gutter-desktop">
        <Link href={HOME[role]} className="text-brand font-extrabold no-underline">
          Saait
        </Link>
        <nav aria-label={LABELS[role]} className="flex items-center gap-1">
          {NAVS[role].map(({ key, label, href }) => {
            const on = key === active;
            return (
              <Link
                key={key}
                href={href}
                aria-current={on ? "page" : undefined}
                className={`rounded-control px-3 py-2.5 text-label font-semibold no-underline ${on ? "bg-tint text-ink" : "text-stone hover:text-ink"}`}
              >
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
