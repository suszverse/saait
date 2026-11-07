import Link from "next/link";
import type { ComponentProps } from "react";

/**
 * 60 px calendar day. Selected inverts to Ink. The marigold dot marks a
 * wedding date; the screen also says so in words.
 */
export function DayCell({
  dow,
  day,
  selected,
  saait,
  label,
  ...rest
}: { dow: string; day: number | string; selected: boolean; saait: boolean; label: string } & ComponentProps<typeof Link>) {
  return (
    <Link
      aria-label={label}
      aria-current={selected ? "date" : undefined}
      className={`flex h-15 min-w-0 flex-col items-center justify-center gap-0.5 rounded-control border transition-colors ${
        selected ? "border-ink bg-ink text-white" : "border-line bg-white text-ink hover:border-ink"
      }`}
      {...rest}
    >
      <span className={`text-nano ${selected ? "text-white/75" : "text-stone"}`}>{dow}</span>
      <span className="text-lead leading-5 font-bold">{day}</span>
      <span aria-hidden="true" className={`size-1.5 rounded-chip ${saait ? "bg-marigold" : "bg-transparent"}`} />
    </Link>
  );
}
