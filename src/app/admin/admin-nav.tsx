"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type AdminNavItem = {
  label: string;
  /** Empty string marks a placeholder for a later phase. */
  href: string;
  count?: number;
};

/** Sidebar links; `aria-current` follows the active path prefix so the server layout stays path-agnostic. */
export function AdminNav({ items }: { items: AdminNavItem[] }) {
  const pathname = usePathname();
  return (
    <>
      {items.map(({ label, href, count }) => {
        if (!href) {
          return (
            <span key={label} className="hidden h-11 items-center justify-between px-3 text-label font-semibold text-stone md:flex" title="Coming in a later phase">
              {label}
              <span className="text-micro font-normal">Later</span>
            </span>
          );
        }
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={label}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex h-11 items-center justify-between rounded-control px-3 text-label no-underline ${active ? "bg-tint font-bold" : "font-semibold text-ink"}`}
          >
            <span>{label}</span>
            {count ? (
              <span className="inline-flex h-5.5 items-center rounded-chip bg-ink px-2 text-micro font-normal text-on-accent">
                {count}
                <span className="sr-only"> awaiting review</span>
              </span>
            ) : null}
          </Link>
        );
      })}
    </>
  );
}
