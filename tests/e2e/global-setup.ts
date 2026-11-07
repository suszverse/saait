/**
 * E2E runs against its own database, saait_e2e, rebuilt from migrations and
 * the seed on every run, so the suite never touches development data.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { runMigrations } from "../../src/server/db/migrate";
import * as s from "../../src/server/db/schema";
import { seed } from "../../src/server/db/seed";
import { E2E_DB_URL } from "./helpers";

export default async function globalSetup() {
  // This drops and recreates the database: refuse anything not named *_e2e.
  if (!/\/[a-z0-9_]+_e2e(\?|$)/.test(E2E_DB_URL)) throw new Error(`Refusing to reset ${E2E_DB_URL}: the e2e database name must end in _e2e`);
  const admin = postgres(E2E_DB_URL.replace(/\/[^/?]+(\?|$)/, "/postgres$1"), { max: 1, onnotice: () => {} });
  const name = new URL(E2E_DB_URL).pathname.slice(1);
  await admin.unsafe(`drop database if exists ${name} with (force)`);
  await admin.unsafe(`create database ${name}`);
  await admin.end();
  await runMigrations(E2E_DB_URL);
  const client = postgres(E2E_DB_URL, { max: 1, onnotice: () => {} });
  await seed(drizzle(client, { schema: s, casing: "snake_case" }));
  await client.end();
}
