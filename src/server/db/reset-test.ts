/** Drops and recreates the test database schema, then migrates. Never touches DATABASE_URL. */
import nextEnv from "@next/env";
import postgres from "postgres";
import { runMigrations } from "./migrate";

nextEnv.loadEnvConfig(process.cwd());
const url = process.env.DATABASE_URL_TEST;
if (!url || !/_test(\?|$)/.test(url)) throw new Error("DATABASE_URL_TEST must point at a database whose name ends in _test");

const sql = postgres(url, { max: 1, onnotice: () => {} });
await sql`drop schema if exists public cascade`;
await sql`drop schema if exists drizzle cascade`;
await sql`create schema public`;
await sql.end();
await runMigrations(url);
console.log("test database reset");
