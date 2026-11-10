import Link from "next/link";
import { LevelBadge } from "@/components/ui/level-badge";
import { formatRs, paisa } from "@/lib/money";
import type { CrewMatch } from "@/server/crew/jobs";

/** Two-character code of a crew alias such as "C4-821": the first two characters. */
export function crewCode(alias: string): string {
  return alias.replace(/^Crew\s+/i, "").slice(0, 2).toUpperCase();
}

/** Round private avatar carrying the two-character crew code; no face, no name. */
export function CrewAvatar({ alias, size = 48 }: { alias: string; size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center rounded-chip bg-tint text-label font-extrabold text-ink"
      style={{ width: size, height: size }}
    >
      {crewCode(alias)}
    </span>
  );
}

/** Crew result card (Figma B2). The whole card is one link to the private profile. */
export function CrewCard({ crew, href }: { crew: CrewMatch; href: string }) {
  const label = crew.alias;
  return (
    <Link
      href={href}
      className="flex flex-col gap-3 rounded-card border border-line bg-ground p-4 transition-colors hover:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
    >
      <div className="flex items-center gap-3">
        <CrewAvatar alias={crew.alias} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate text-body font-bold">{label}</span>
          <span>
            <LevelBadge level={crew.level} size="sm" />
          </span>
        </div>
      </div>
      {crew.headline ? <p className="text-small">{crew.headline}</p> : null}
      {crew.roles.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {crew.roles.map((r) => (
            <li key={r} className="inline-flex h-6.5 items-center rounded-chip bg-tint px-2.5 text-micro font-semibold">
              {r}
            </li>
          ))}
        </ul>
      ) : null}
      <p className="text-small font-semibold">Reliability {crew.reliability}</p>
      <p className="text-meta text-stone">
        {crew.dayRate !== null ? `${formatRs(paisa(crew.dayRate))} a day · paid by you directly` : "Day rate agreed when you hire · paid by you directly"}
      </p>
      <p className="text-meta text-stone">{crew.distanceKm} km away</p>
    </Link>
  );
}
