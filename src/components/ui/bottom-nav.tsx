import Link from "next/link";
import { CalendarIcon, HomeIcon, LockIcon, PackageIcon, SearchIcon, UserIcon } from "./icons";

const NAVS = {
  client: [
    { key: "dates", label: "Dates", href: "/", Icon: CalendarIcon },
    { key: "browse", label: "Browse", href: "/results", Icon: SearchIcon },
    { key: "bookings", label: "Bookings", href: "/bookings", Icon: LockIcon },
    { key: "you", label: "You", href: "/login", Icon: UserIcon },
  ],
  provider: [
    { key: "today", label: "Today", href: "/provider", Icon: HomeIcon },
    { key: "calendar", label: "Calendar", href: "/provider", Icon: CalendarIcon },
    { key: "packages", label: "Packages", href: "/provider", Icon: PackageIcon },
    { key: "account", label: "Account", href: "/provider/kyc", Icon: UserIcon },
  ],
} as const;

export type NavRole = keyof typeof NAVS;

/**
 * Phone bottom navigation, 84 px with the home-indicator inset. On desktop
 * widths it is hidden; the site header carries the same links.
 */
export function BottomNav({ role, active }: { role: NavRole; active: string }) {
  return (
    <nav
      aria-label={role === "client" ? "Main" : "Provider"}
      className="sticky bottom-0 z-10 grid h-21 grid-cols-4 border-t border-line bg-white px-2 pt-2 pb-5 md:hidden"
    >
      {NAVS[role].map(({ key, label, href, Icon }) => {
        const on = key === active;
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
    <header className="hidden border-b border-line bg-white md:block">
      <div className="mx-auto flex h-16 max-w-page items-center justify-between px-gutter-desktop">
        <Link href={role === "client" ? "/" : "/provider"} className="text-brand font-extrabold no-underline">
          Saait
        </Link>
        <nav aria-label={role === "client" ? "Main" : "Provider"} className="flex items-center gap-1">
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
