/**
 * Housekeeping, safe to run as often as you like (every 5 minutes is plenty):
 * expire 24-hour holds so their slots return, and retry confirmation SMS that
 * failed. Usage: pnpm jobs:tick  (cron, systemd timer or the host's scheduler)
 */
import nextEnv from "@next/env";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as s from "../db/schema";
import { expireHolds, retryPendingConfirmations } from "../bookings";
import { manualGateway } from "../payments/manual";
import { consoleSender } from "../sms/console";

nextEnv.loadEnvConfig(process.cwd());
const client = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
const db = drizzle(client, { schema: s, casing: "snake_case" });
const sms = consoleSender(async (row) => {
  await db.insert(s.smsLog).values(row);
});
try {
  const expired = await expireHolds(db);
  const resent = await retryPendingConfirmations({ db, sms, gateway: manualGateway(process.env.PAYMENT_WEBHOOK_SECRET ?? "x".repeat(32)) });
  console.log(JSON.stringify({ expired, resent }));
} finally {
  await client.end();
}
