import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import * as s from "./db/schema";
import { getTheme, setTheme } from "./settings";

const client = postgres(process.env.DATABASE_URL_TEST ?? "", { max: 1, onnotice: () => {} });
const db = drizzle(client, { schema: s, casing: "snake_case" });
let userId: string;

beforeAll(async () => {
  const [u] = await db.insert(s.users).values({ phone: "+9779800009915" }).returning();
  userId = u.id;
});
afterAll(async () => {
  await db.delete(s.users).where(eq(s.users.id, userId));
  await client.end();
});

describe("theme preference", () => {
  it("defaults to system", async () => {
    expect(await getTheme(db, userId)).toBe("system");
  });

  it("round-trips a valid save", async () => {
    expect(await setTheme(db, userId, "dark")).toBe("dark");
    expect(await getTheme(db, userId)).toBe("dark");
    expect(await setTheme(db, userId, "system")).toBe("system");
    expect(await getTheme(db, userId)).toBe("system");
  });

  it("rejects anything outside the enum without touching the row", async () => {
    await setTheme(db, userId, "light");
    await expect(setTheme(db, userId, "blue")).rejects.toBeInstanceOf(ZodError);
    await expect(setTheme(db, userId, undefined)).rejects.toBeInstanceOf(ZodError);
    expect(await getTheme(db, userId)).toBe("light");
  });

  it("answers system for an unknown user", async () => {
    expect(await getTheme(db, "00000000-0000-0000-0000-000000000000")).toBe("system");
  });
});
