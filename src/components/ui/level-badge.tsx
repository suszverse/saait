import type { LevelName } from "@/lib/levels";

/**
 * Reputation level pill. Rewards use Teal, never Marigold; "New" is the quiet
 * Stone-on-Tint variant so a fresh provider is not visually rewarded yet.
 * Sizes match StatusChip so the two sit on one row: sm (22 px) in result rows,
 * md (26 px) in headers and boards.
 */
export function LevelBadge({ level, size = "md" }: { level: LevelName; size?: "sm" | "md" }) {
  const h = size === "sm" ? "h-5.5 px-2 text-nano gap-0.75" : "h-6.5 px-2.5 text-micro gap-1";
  const tone = level === "New" ? "bg-tint text-stone" : "bg-teal-tint text-teal";
  return (
    <span className={`inline-flex shrink-0 items-center rounded-chip font-semibold whitespace-nowrap ${h} ${tone}`}>
      <StarIcon size={size === "sm" ? 10 : 12} />
      <span className="sr-only">Level </span>
      {level}
    </span>
  );
}

/** Filled star, decorative; the word beside it carries the meaning. */
function StarIcon({ size }: { size: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="m12 2.5 2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6L2.5 9.4l6.6-.8z" />
    </svg>
  );
}
