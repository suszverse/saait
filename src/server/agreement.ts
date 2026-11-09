/**
 * Agreement acceptance. A user accepts the current terms version once; the
 * row in agreement_acceptances is the proof, and the audit log records when
 * it happened. Accepting an old version is refused so a user who read stale
 * copy is sent back to the current text.
 */
import { and, count, eq } from "drizzle-orm";
import { z } from "zod";
import { loadTerms } from "@/lib/terms";
import { audit } from "./audit";
import * as s from "./db/schema";
import type { Db } from "./providers";

export class AgreementError extends Error {
  constructor(
    public readonly code: "stale_version",
    message: string,
  ) {
    super(message);
  }
}

export const acceptAgreementInput = z.object({
  version: z.string().min(1).max(40),
  accepted: z.literal(true),
});

/** The version string of the terms currently shipped in src/content/terms.md. */
export function currentAgreementVersion(): string {
  return loadTerms().version;
}

/**
 * Records that `userId` accepted the current terms. Idempotent: a repeat
 * call inserts nothing and writes no audit row.
 */
export async function acceptAgreement(db: Db, userId: string, raw: unknown): Promise<{ version: string; inserted: boolean }> {
  const input = acceptAgreementInput.parse(raw);
  const version = currentAgreementVersion();
  if (input.version !== version) {
    throw new AgreementError("stale_version", "The terms have been updated. Please read the current version and accept again.");
  }
  const inserted = await db
    .insert(s.agreementAcceptances)
    .values({ userId, version })
    .onConflictDoNothing({ target: [s.agreementAcceptances.userId, s.agreementAcceptances.version] })
    .returning({ id: s.agreementAcceptances.id });
  if (inserted.length > 0) {
    await audit(db, { actorId: userId, action: "agreement.accepted", subjectType: "user", subjectId: userId, detail: { version } });
  }
  return { version, inserted: inserted.length > 0 };
}

/** True when the user has accepted the version currently shipped. */
export async function hasAcceptedCurrent(db: Db, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ n: count() })
    .from(s.agreementAcceptances)
    .where(and(eq(s.agreementAcceptances.userId, userId), eq(s.agreementAcceptances.version, currentAgreementVersion())));
  return (row?.n ?? 0) > 0;
}
