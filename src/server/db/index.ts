import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/env";
import * as schema from "./schema";

export type Db = ReturnType<typeof createDb>;

export function createDb(url: string) {
  const client = postgres(url, { max: 10, prepare: false });
  return drizzle(client, { schema, casing: "snake_case" });
}

const globalForDb = globalThis as unknown as { saaitDb?: Db };

/** One pool per process, survives dev hot reload. */
export function db(): Db {
  globalForDb.saaitDb ??= createDb(env().DATABASE_URL);
  return globalForDb.saaitDb;
}

export { schema };
