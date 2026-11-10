import Link from "next/link";
import type { LevelName } from "@/lib/levels";
import { CheckIcon } from "./icons";
import { LevelBadge } from "./level-badge";

/** "1.2 km away"; under a kilometre reads "under 1 km away". */
export function distanceAway(km: number) {
  return km < 1 ? "under 1 km away" : `${km.toFixed(1)} km away`;
}

/**
 * Grid tile: 4:5 portfolio image (grey tone until real portfolios arrive),
 * Verified badge and level badge, name, city and rating, from-price.
 */
export function ProviderTile({
  href,
  name,
  meta,
  price,
  tone,
  verified = true,
  level,
  distanceKm,
}: {
  href: string;
  name: string;
  meta: string;
  price: string;
  tone: string;
  verified?: boolean;
  level?: LevelName;
  distanceKm?: number;
}) {
  return (
    <Link href={href} className="flex min-w-0 flex-col gap-2 no-underline">
      <span className="relative block aspect-[4/5] overflow-hidden rounded-card">
        {/* Placeholder until real portfolio images arrive; decorative. */}
        <span aria-hidden="true" className="absolute inset-0" style={{ background: tone }} />
        {(verified || level) && (
          <span className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
            {verified && (
              <span className="flex h-6.5 items-center gap-1 rounded-chip bg-ground px-2.5 text-micro font-bold text-teal">
                <CheckIcon size={12} strokeWidth={3} />
                Verified
              </span>
            )}
            {level && <LevelBadge level={level} />}
          </span>
        )}
      </span>
      <span className="flex flex-col gap-px">
        <span className="text-label font-bold">{name}</span>
        <span className="text-meta text-stone">{distanceKm == null ? meta : [meta, distanceAway(distanceKm)].filter(Boolean).join(" · ")}</span>
        <span className="mt-0.5 text-small font-semibold">{price}</span>
      </span>
    </Link>
  );
}
