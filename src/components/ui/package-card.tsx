import type { ReactNode } from "react";

export type PackageCardData = {
  name: string;
  price: string; // formatted at the edge, e.g. "Rs 65,000"
  description: string;
  specs?: string[]; // regular size: "10 hours", "2 shooters", ...
  peakNote: string; // "Plus Rs 8,000 on a wedding date" or "No surcharge"
};

/**
 * Fixed-price package. The peak-date surcharge is written on the card, never
 * revealed at checkout. Compact is the selectable row on the provider page.
 */
export function PackageCard({
  data,
  size = "regular",
  selected = false,
  as: As = "div",
  children,
}: {
  data: PackageCardData;
  size?: "regular" | "compact";
  selected?: boolean;
  as?: "div" | "span";
  children?: ReactNode;
}) {
  const regular = size === "regular";
  return (
    <As
      className={`flex w-full flex-col rounded-card border text-left ${
        regular ? "gap-2.5 p-4.5" : "gap-1.5 px-4 py-3.5"
      } ${selected ? "border-ink" : "border-line"} ${!regular && selected ? "bg-tint" : "bg-white"}`}
    >
      <span className="flex w-full items-baseline justify-between gap-2">
        <span className={regular ? "text-heading font-bold" : "text-lead font-bold"}>{data.name}</span>
        <span className={regular ? "text-heading font-extrabold" : "text-lead font-extrabold"}>{data.price}</span>
      </span>
      <span className="text-small text-stone">{data.description}</span>
      {regular && data.specs && (
        <span className="flex flex-wrap gap-x-3.5 gap-y-1.5 text-small">
          {data.specs.map((s) => (
            <span key={s}>{s}</span>
          ))}
        </span>
      )}
      <span className="text-meta text-marigold-text">{data.peakNote}</span>
      {children}
    </As>
  );
}
