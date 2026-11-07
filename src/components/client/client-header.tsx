"use client";

import { usePathname } from "next/navigation";
import { SiteHeader } from "@/components/ui";

/** Desktop header with the tab that matches the current page. */
export function ClientHeader() {
  const path = usePathname();
  const active = path.startsWith("/results") || path.startsWith("/p/") ? "browse" : path.startsWith("/book") ? "bookings" : path.startsWith("/login") ? "you" : "dates";
  return <SiteHeader role="client" active={active} />;
}
