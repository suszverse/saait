/**
 * Reputation levels. A level is read off lifetime points (every points row
 * except plan-month spends), so spending points on a plan month never drops a
 * provider back a level. Pure; no I/O.
 */

export const LEVELS = [
  { name: "New", min: 0 },
  { name: "Trusted", min: 300 },
  { name: "Proven", min: 1000 },
  { name: "Top", min: 2500 },
] as const;

export type LevelName = (typeof LEVELS)[number]["name"];
export type Level = (typeof LEVELS)[number];

/** The highest level whose threshold the points reach; anything below zero is still New. */
export function levelFor(lifetimePoints: number): LevelName {
  let level: Level = LEVELS[0];
  for (const l of LEVELS) if (lifetimePoints >= l.min) level = l;
  return level.name;
}

/** The next level up and how many points are still needed, or null at the top. */
export function nextLevel(lifetimePoints: number): { name: LevelName; pointsToGo: number } | null {
  const current = LEVELS.findIndex((l) => l.name === levelFor(lifetimePoints));
  const next = LEVELS[current + 1];
  if (!next) return null;
  // A negative lifetime still sits in New, so the climb is measured from zero.
  return { name: next.name, pointsToGo: next.min - Math.max(0, lifetimePoints) };
}
