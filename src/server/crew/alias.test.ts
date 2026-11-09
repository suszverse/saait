import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as s from "../db/schema";
import { seed } from "../db/seed";
import { ALIAS_PATTERN, generateAlias, uniqueAlias } from "./alias";

const client = postgres(process.env.DATABASE_URL_TEST ?? "", { max: 1, onnotice: () => {} });
const db = drizzle(client, { schema: s, casing: "snake_case" });

/** Deterministic rand that hands out the given fractions in order, then repeats the last. */
const sequence = (...values: number[]) => {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
};

beforeAll(async () => {
  await client`truncate table users, cities, service_categories, auspicious_dates restart identity cascade`;
  await seed(db);
});
afterAll(async () => {
  await client.end();
});

describe("generateAlias", () => {
  it("matches the column CHECK and never uses the backfilled letter A", () => {
    for (let i = 0; i < 500; i++) {
      const alias = generateAlias();
      expect(alias).toMatch(ALIAS_PATTERN);
      expect(alias[5]).not.toBe("A");
    }
    expect(generateAlias(() => 0)).toBe("Crew B0-000");
    expect(generateAlias(() => 0.999999)).toBe("Crew Z9-999");
    // A rand that returns exactly 1 must not fall off the end of the alphabet.
    expect(generateAlias(() => 1)).toBe("Crew Z9-999");
  });
});

describe("uniqueAlias", () => {
  it("skips an alias already held by a profile", async () => {
    const [u] = await db.insert(s.users).values({ phone: "+9779800008888", role: "provider" }).returning();
    await db.insert(s.providerProfiles).values({ userId: u.id, slug: "taken-crew", displayName: "Taken", alias: "Crew B0-000" });
    // First three draws produce "Crew B0-000", the fourth "Crew Z9-999".
    const rand = sequence(0, 0, 0, 0, 0, 0, 0, 0, 0, 0.999);
    expect(await uniqueAlias(db, rand)).toBe("Crew Z9-999");
  });

  it("gives up after 20 collisions", async () => {
    await expect(uniqueAlias(db, () => 0)).rejects.toThrow(/20 tries/);
  });

  it("returns an alias the CHECK and unique index accept", async () => {
    const alias = await uniqueAlias(db);
    expect(alias).toMatch(ALIAS_PATTERN);
    const [u] = await db.insert(s.users).values({ phone: "+9779800008889", role: "provider" }).returning();
    await expect(db.insert(s.providerProfiles).values({ userId: u.id, slug: "fresh-crew", displayName: "Fresh", alias })).resolves.toBeDefined();
  });
});
