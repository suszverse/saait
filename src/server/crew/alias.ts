/**
 * Crew aliases. Freelancers are anonymous to clients and to the businesses
 * browsing them, so each one gets a "Crew B3-417" handle instead of a name.
 * The shape is fixed by the provider_profiles CHECK and the partial unique
 * index on alias (migration 0002).
 */

import { eq } from "drizzle-orm";
import * as s from "../db/schema";
import type { Db } from "../providers";

export const ALIAS_PATTERN = /^Crew [A-Z][0-9]-[0-9]{3}$/;

// Migration 0002 backfilled existing freelancers counting up from "Crew A0-000",
// so generated aliases skip the letter A altogether.
const LETTERS = "BCDEFGHIJKLMNOPQRSTUVWXYZ";
const MAX_TRIES = 20;

const pick = (rand: () => number, n: number) => Math.min(n - 1, Math.floor(rand() * n));

/** One random alias in the "Crew B3-417" shape. Uniqueness is the caller's job. */
export function generateAlias(rand: () => number = Math.random): string {
  const letter = LETTERS[pick(rand, LETTERS.length)];
  const digit = pick(rand, 10);
  const tail = String(pick(rand, 1000)).padStart(3, "0");
  return `Crew ${letter}${digit}-${tail}`;
}

/** Generates until no provider profile holds the alias; gives up after 20 tries. */
export async function uniqueAlias(db: Db, rand: () => number = Math.random): Promise<string> {
  for (let i = 0; i < MAX_TRIES; i++) {
    const alias = generateAlias(rand);
    const [taken] = await db.select({ id: s.providerProfiles.id }).from(s.providerProfiles).where(eq(s.providerProfiles.alias, alias)).limit(1);
    if (!taken) return alias;
  }
  throw new Error(`Could not find a free crew alias in ${MAX_TRIES} tries`);
}
