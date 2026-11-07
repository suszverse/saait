import Link from "next/link";
import { CheckIcon } from "./icons";

/**
 * Grid tile: 4:5 portfolio image (grey tone until real portfolios arrive),
 * Verified badge, name, city and rating, from-price.
 */
export function ProviderTile({
  href,
  name,
  meta,
  price,
  tone,
  verified = true,
}: {
  href: string;
  name: string;
  meta: string;
  price: string;
  tone: string;
  verified?: boolean;
}) {
  return (
    <Link href={href} className="flex min-w-0 flex-col gap-2 no-underline">
      <span className="relative block aspect-[4/5] overflow-hidden rounded-card">
        {/* Placeholder until real portfolio images arrive; decorative. */}
        <span aria-hidden="true" className="absolute inset-0" style={{ background: tone }} />
        {verified && (
          <span className="absolute top-2.5 left-2.5 flex h-6.5 items-center gap-1 rounded-chip bg-white px-2.5 text-micro font-bold text-teal">
            <CheckIcon size={12} strokeWidth={3} />
            Verified
          </span>
        )}
      </span>
      <span className="flex flex-col gap-px">
        <span className="text-label font-bold">{name}</span>
        <span className="text-meta text-stone">{meta}</span>
        <span className="mt-0.5 text-small font-semibold">{price}</span>
      </span>
    </Link>
  );
}
