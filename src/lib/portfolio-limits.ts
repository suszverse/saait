/**
 * Portfolio limits (docs/proposals/leakage-and-rewards.md, section 11). The
 * showcase grows with the plan for a business and with the level for a
 * freelancer. Pure; no I/O. Uses string unions rather than the Drizzle enums so
 * the UI can import it without pulling in the database layer.
 */

import { LEVELS, type LevelName } from "./levels";

export type ProviderKind = "freelancer" | "studio";
export type Plan = "free" | "pro" | "studio";

export type PortfolioLimits = { photos: number; clips: number };

export const MAX_PHOTO_BYTES = 20 * 1024 * 1024;
export const MAX_CLIP_BYTES = 200 * 1024 * 1024;
export const MAX_CLIP_SECONDS = 60;

/** What a paid business plan buys: enough for a wedding story without an endless gallery. */
export const BUSINESS_LIMITS: PortfolioLimits = { photos: 20, clips: 15 };

/** The freelancer ladder; Proven and Top match a business, since Top can open a business profile. */
export const FREELANCER_LIMITS: Record<LevelName, PortfolioLimits> = {
  New: { photos: 12, clips: 6 },
  Trusted: { photos: 16, clips: 10 },
  Proven: { photos: 20, clips: 15 },
  Top: { photos: 20, clips: 15 },
};

export type LimitsInput = { kind: ProviderKind; plan: Plan; level: LevelName };

/**
 * A business on a paid plan gets the plan's showcase. A studio on the free
 * plan (never subscribed, or lapsed) keeps the freelancer New floor of 12/6
 * rather than zero: the profile still shows something to a client who lands
 * on an old link or a kept booking, and existing items are not wiped the day
 * the plan lapses. Level does not grow a studio's limit; only the plan does.
 */
export function limitsFor({ kind, plan, level }: LimitsInput): PortfolioLimits {
  if (kind === "studio") return plan === "free" ? FREELANCER_LIMITS.New : BUSINESS_LIMITS;
  return FREELANCER_LIMITS[level];
}

/**
 * The limits at the next level up, or null when nothing more can be earned
 * by levelling: a studio (the plan sets its limit) or a freelancer at Top.
 * Drives the "20 at Proven" hint on the freelancer editor.
 */
export function nextLimits({ kind, level }: LimitsInput): PortfolioLimits | null {
  if (kind === "studio") return null;
  const i = LEVELS.findIndex((l) => l.name === level);
  const next = LEVELS[i + 1];
  if (!next) return null;
  return FREELANCER_LIMITS[next.name];
}
