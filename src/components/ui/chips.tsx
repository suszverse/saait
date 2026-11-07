import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { CheckIcon } from "./icons";

const filterBase =
  "inline-flex h-10 shrink-0 items-center rounded-chip border px-3.5 text-small font-semibold whitespace-nowrap transition-colors";

export function filterChipClass(selected: boolean) {
  return `${filterBase} ${selected ? "border-ink bg-ink text-white" : "border-line bg-white text-ink hover:border-ink"}`;
}

/** Single-select filter chip rendered as a link so the choice lives in the URL. */
export function FilterChipLink({ selected, children, ...rest }: { selected: boolean; children: ReactNode } & ComponentProps<typeof Link>) {
  return (
    <Link className={filterChipClass(selected)} aria-current={selected ? "true" : undefined} {...rest}>
      {children}
    </Link>
  );
}

export type StatusType = "verified" | "saait" | "urgent" | "under_review" | "rejected" | "neutral";

const status: Record<StatusType, string> = {
  verified: "bg-teal-tint text-teal",
  saait: "bg-marigold-tint text-marigold-text",
  urgent: "bg-marigold-tint text-marigold-text",
  under_review: "bg-tint text-stone",
  rejected: "bg-sindoor-tint text-sindoor",
  neutral: "bg-tint text-stone",
};

/** Verified is never shown by colour alone: it always carries the check and the word. */
export function StatusChip({ type, children, size = "md" }: { type: StatusType; children?: ReactNode; size?: "sm" | "md" }) {
  // sm (22 px) is the in-row badge on Results and Urgent; md (26 px) is the board size.
  const h = size === "sm" ? "h-5.5 px-2 text-nano gap-0.75" : "h-6.5 px-2.5 text-micro gap-1";
  const label = children ?? defaultLabel[type];
  if (!label) return null;
  return (
    <span className={`inline-flex shrink-0 items-center rounded-chip font-bold ${h} ${status[type]}`}>
      {type === "verified" && <CheckIcon size={size === "sm" ? 10 : 12} strokeWidth={3} />}
      {type === "saait" && <span aria-hidden="true" className="size-1.5 rounded-chip bg-marigold" />}
      {label}
    </span>
  );
}

const defaultLabel: Record<StatusType, string> = {
  verified: "Verified",
  saait: "Saait",
  urgent: "Urgent",
  under_review: "Under review",
  rejected: "Rejected",
  neutral: "",
};

/** Marigold dot that marks a wedding date. Always paired with words nearby. */
export function SaaitDot({ size = 6 }: { size?: number }) {
  return <span aria-hidden="true" className="inline-block shrink-0 rounded-chip bg-marigold" style={{ width: size, height: size }} />;
}
