import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as s from "./db/schema";

type Db = PostgresJsDatabase<typeof s>;

/** Section 15: every KYC decision, document view, payout and dispute outcome is logged. */
export async function audit(
  db: Db,
  entry: { actorId: string | null; action: string; subjectType: string; subjectId: string; detail?: unknown },
) {
  await db.insert(s.auditLog).values({ ...entry, detail: entry.detail ?? null });
}
