import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd(), false);
// Tests never touch the development database.
if (process.env.DATABASE_URL_TEST) process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
