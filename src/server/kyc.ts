/**
 * Provider KYC, system plan section 15. KYC is a gate: nothing goes public,
 * receives enquiries or gets bookings until an operator verifies it.
 *
 * Tiers in Phase 1: registered (draft) and verified. Verified Studio and
 * Urgent-eligible are Phase 2 and read the same records.
 */
import { createHash } from "node:crypto";
import { and, desc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { z } from "zod";
import * as s from "./db/schema";
import { audit } from "./audit";
import type { SmsSender } from "./sms";
import { ALLOWED_DOCUMENT_TYPES, MAX_DOCUMENT_BYTES, sniffType, type DocumentStore } from "./storage";
import { addDays, todayInNepal } from "@/lib/nepali-date";

type Db = PostgresJsDatabase<typeof s>;
export type Deps = { db: Db; store: DocumentStore; sms: SmsSender; now?: () => Date };

export class KycError extends Error {
  constructor(
    public readonly code:
      | "not_found"
      | "bad_file"
      | "too_large"
      | "missing_documents"
      | "missing_details"
      | "locked"
      | "wrong_state"
      | "checklist_incomplete"
      | "note_required"
      | "forbidden"
      | "duplicate",
    message: string,
  ) {
    super(message);
  }
}

export const REQUIRED_DOCUMENTS = ["id_front", "id_back", "selfie", "pan_certificate", "payout_proof"] as const;
export const REJECTION_LOCK_DAYS = 90;
export const PAYOUT_HOLD_DAYS = 7;
export const REVERIFY_AFTER_DAYS = 365;

/** The operator checklist from section 15, in the order the desk shows it. */
export const CHECKLIST = [
  { key: "id_legible", label: "ID is legible and not expired" },
  { key: "selfie_matches", label: "Selfie matches the ID photo" },
  { key: "pan_name_matches", label: "PAN name matches ID name" },
  { key: "payout_name_matches", label: "Payout account name matches" },
  { key: "portfolio_original", label: "Portfolio is original (3 images spot checked)" },
  { key: "no_duplicates", label: "No duplicate phone, ID or PAN" },
] as const;
export type ChecklistKey = (typeof CHECKLIST)[number]["key"];

// ---------- inputs (zod at the boundary) ----------
export const identityInput = z
  .object({
    idType: z.enum(["citizenship", "passport"]),
    idNumber: z.string().trim().min(4, "Enter the number printed on the card.").max(40),
  })
  .refine((v) => (v.idType === "citizenship" ? /[0-9०-९]/.test(v.idNumber) : /[0-9A-Za-z]{5,}/.test(v.idNumber)), {
    message: "That does not look like a valid number. Check the card.",
    path: ["idNumber"],
  });

export const panInput = z.object({
  pan: z
    .string()
    .trim()
    .transform((v) => v.replace(/[०-९]/g, (d) => String("०१२३४५६७८९".indexOf(d))).replace(/\s/g, ""))
    .pipe(z.string().regex(/^\d{9}$/, "A PAN has 9 digits. Check your PAN card.")),
  vatRegistered: z.boolean(),
});

export const payoutInput = z.object({
  method: z.enum(["bank", "esewa", "khalti"]),
  accountName: z.string().trim().min(2, "Enter the name on the account.").max(120),
  accountNumber: z.string().trim().min(6, "Enter the account or wallet number.").max(40),
});

export const decisionInput = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("approve"), checklist: z.record(z.string(), z.boolean()), note: z.string().optional() }),
  z.object({ decision: z.literal("reject"), checklist: z.record(z.string(), z.boolean()), note: z.string().trim().min(5, "Say what was wrong so the provider can fix it.") }),
  z.object({ decision: z.literal("better_photo"), checklist: z.record(z.string(), z.boolean()), note: z.string().trim().min(5, "Say which photo and what to fix.") }),
]);

// ---------- provider side ----------
async function profileOf(db: Db, providerId: string) {
  const [p] = await db.select().from(s.providerProfiles).where(eq(s.providerProfiles.id, providerId));
  if (!p) throw new KycError("not_found", "Provider not found");
  return p;
}

function assertEditable(p: typeof s.providerProfiles.$inferSelect) {
  if (p.kycStatus === "submitted" || p.kycStatus === "under_review") {
    throw new KycError("wrong_state", "Your documents are with our team. You can change them after the review.");
  }
}

/**
 * Section 15: a verified provider who changes identity details, documents or
 * payout account is re-verified. Payout changes also hold payouts for 7 days
 * from that change, every time.
 */
async function afterChange(
  deps: Deps,
  actor: { userId: string },
  p: typeof s.providerProfiles.$inferSelect,
  what: string,
  opts: { payoutHold?: boolean } = {},
) {
  const wasCleared = p.kycStatus === "verified" || p.kycStatus === "reverification_due";
  if (!wasCleared) return { reverify: false };
  const holdUntil = opts.payoutHold ? addDays(todayInNepal(deps.now?.()), PAYOUT_HOLD_DAYS) : undefined;
  await deps.db
    .update(s.providerProfiles)
    .set({ kycStatus: "reverification_due", ...(holdUntil ? { payoutHoldUntil: holdUntil } : {}) })
    .where(eq(s.providerProfiles.id, p.id));
  await audit(deps.db, { actorId: actor.userId, action: `kyc.changed.${what}`, subjectType: "provider", subjectId: p.id, detail: { holdUntil: holdUntil ?? null } });
  return { reverify: true };
}

/** Account numbers compare on letters and digits only: 98-1234-4471 = 9812344471. */
export function accountKey(n: string): string {
  return n.replace(/[०-९]/g, (d) => String("०१२३४५६७८९".indexOf(d))).replace(/[^0-9A-Za-z]/g, "").toUpperCase();
}

export async function uploadDocument(
  deps: Deps,
  actor: { userId: string; providerId: string },
  kind: (typeof s.documentKindEnum.enumValues)[number],
  bytes: Uint8Array,
) {
  const p = await profileOf(deps.db, actor.providerId);
  if (p.userId !== actor.userId) throw new KycError("forbidden", "Not your profile");
  assertEditable(p);
  if (bytes.byteLength === 0) throw new KycError("bad_file", "That file is empty. Take the photo again.");
  if (bytes.byteLength > MAX_DOCUMENT_BYTES) throw new KycError("too_large", "That file is over 8 MB. Take the photo again at a lower size.");
  const mime = sniffType(bytes);
  if (!mime || !(ALLOWED_DOCUMENT_TYPES as readonly string[]).includes(mime)) {
    throw new KycError("bad_file", "Upload a photo (JPEG, PNG, WebP or HEIC) or a PDF.");
  }
  const storageKey = await deps.store.put(bytes);
  const now = deps.now?.() ?? new Date();
  const doc = await deps.db.transaction(async (tx) => {
    await tx
      .update(s.providerDocuments)
      .set({ supersededAt: now })
      .where(and(eq(s.providerDocuments.providerId, p.id), eq(s.providerDocuments.kind, kind), isNull(s.providerDocuments.supersededAt)));
    const [d] = await tx
      .insert(s.providerDocuments)
      .values({ providerId: p.id, kind, storageKey, mimeType: mime, byteSize: bytes.byteLength, sha256: createHash("sha256").update(bytes).digest("hex") })
      .returning();
    return d;
  });
  await afterChange(deps, actor, p, `document.${kind}`);
  return doc;
}

export async function currentDocuments(db: Db, providerId: string) {
  return db
    .select()
    .from(s.providerDocuments)
    .where(and(eq(s.providerDocuments.providerId, providerId), isNull(s.providerDocuments.supersededAt)))
    .orderBy(desc(s.providerDocuments.createdAt));
}

export async function saveIdentity(deps: Deps, actor: { userId: string; providerId: string }, raw: unknown) {
  const v = identityInput.parse(raw);
  const p = await profileOf(deps.db, actor.providerId);
  if (p.userId !== actor.userId) throw new KycError("forbidden", "Not your profile");
  assertEditable(p);
  try {
    await deps.db
      .update(s.providerProfiles)
      .set(v.idType === "citizenship" ? { citizenshipNumber: v.idNumber, passportNumber: null } : { passportNumber: v.idNumber, citizenshipNumber: null })
      .where(eq(s.providerProfiles.id, p.id));
  } catch (e) {
    if (isUniqueViolation(e)) throw new KycError("duplicate", "This ID is already on another Saait profile. Call us if this is wrong.");
    throw e;
  }
  const same = v.idType === "citizenship" ? p.citizenshipNumber === v.idNumber : p.passportNumber === v.idNumber;
  if (!same) await afterChange(deps, actor, p, "identity");
}

export async function savePan(deps: Deps, actor: { userId: string; providerId: string }, raw: unknown) {
  const v = panInput.parse(raw);
  const p = await profileOf(deps.db, actor.providerId);
  if (p.userId !== actor.userId) throw new KycError("forbidden", "Not your profile");
  assertEditable(p);
  try {
    await deps.db.update(s.providerProfiles).set({ panNumber: v.pan, vatRegistered: v.vatRegistered }).where(eq(s.providerProfiles.id, p.id));
  } catch (e) {
    if (isUniqueViolation(e)) throw new KycError("duplicate", "This PAN is already on another Saait profile. Call us if this is wrong.");
    throw e;
  }
  if (p.panNumber !== v.pan || p.vatRegistered !== v.vatRegistered) await afterChange(deps, actor, p, "pan");
}

/**
 * Section 15: changing the payout account of a verified provider triggers
 * re-verification and a 7-day payout hold.
 */
export async function savePayout(deps: Deps, actor: { userId: string; providerId: string }, raw: unknown) {
  const v = payoutInput.parse(raw);
  const p = await profileOf(deps.db, actor.providerId);
  if (p.userId !== actor.userId) throw new KycError("forbidden", "Not your profile");
  assertEditable(p);
  const changed =
    p.payoutAccountNumber != null &&
    (accountKey(p.payoutAccountNumber) !== accountKey(v.accountNumber) || p.payoutMethod !== v.method || p.payoutAccountName !== v.accountName);
  await deps.db
    .update(s.providerProfiles)
    .set({ payoutMethod: v.method, payoutAccountName: v.accountName, payoutAccountNumber: v.accountNumber })
    .where(eq(s.providerProfiles.id, p.id));
  return changed ? afterChange(deps, actor, p, "payout", { payoutHold: true }) : { reverify: false };
}

export type Readiness = { documents: Record<(typeof REQUIRED_DOCUMENTS)[number], boolean>; id: boolean; pan: boolean; payout: boolean; ready: boolean };

export async function readiness(db: Db, providerId: string): Promise<Readiness> {
  const p = await profileOf(db, providerId);
  const docs = await currentDocuments(db, providerId);
  const have = new Set(docs.map((d) => d.kind));
  const documents = Object.fromEntries(REQUIRED_DOCUMENTS.map((k) => [k, have.has(k)])) as Readiness["documents"];
  const id = !!(p.citizenshipNumber || p.passportNumber);
  const pan = !!p.panNumber;
  const payout = !!(p.payoutMethod && p.payoutAccountName && p.payoutAccountNumber);
  return { documents, id, pan, payout, ready: id && pan && payout && Object.values(documents).every(Boolean) };
}

export async function submitForReview(deps: Deps, actor: { userId: string; providerId: string }) {
  const p = await profileOf(deps.db, actor.providerId);
  if (p.userId !== actor.userId) throw new KycError("forbidden", "Not your profile");
  if (p.kycStatus === "submitted" || p.kycStatus === "under_review") throw new KycError("wrong_state", "Already with our team.");
  if (p.kycStatus === "verified") throw new KycError("wrong_state", "You are already verified.");
  if (p.kycRejections >= 2) {
    // The second rejection locks the phone for 90 days; after that the
    // provider starts over with a fresh resubmission allowance.
    const [u] = await deps.db.select().from(s.users).where(eq(s.users.id, p.userId));
    const now = deps.now?.() ?? new Date();
    if (!u?.phoneLockedUntil || u.phoneLockedUntil > now) {
      throw new KycError("locked", "Verification was rejected twice. Call us to talk it through.");
    }
    await deps.db.update(s.providerProfiles).set({ kycRejections: 0 }).where(eq(s.providerProfiles.id, p.id));
    p.kycRejections = 0;
  }
  const r = await readiness(deps.db, p.id);
  if (!r.id || !r.pan || !r.payout) throw new KycError("missing_details", "Add your ID number, PAN and payout account first.");
  if (!r.ready) throw new KycError("missing_documents", "Add every photo before sending.");
  await deps.db.update(s.providerProfiles).set({ kycStatus: "submitted" }).where(eq(s.providerProfiles.id, p.id));
  await audit(deps.db, { actorId: actor.userId, action: "kyc.submitted", subjectType: "provider", subjectId: p.id, detail: { resubmission: p.kycRejections > 0 } });
}

// ---------- operator side ----------
export type QueueFilter = "submitted" | "resubmitted" | "reverification_due";

export async function queue(db: Db, filter: QueueFilter | "all" = "all") {
  const rows = await db
    .select({ p: s.providerProfiles, city: s.cities.name })
    .from(s.providerProfiles)
    .leftJoin(s.cities, eq(s.cities.id, s.providerProfiles.homeCityId))
    .where(inArray(s.providerProfiles.kycStatus, ["submitted", "under_review", "reverification_due"]));
  const submittedAt = await db
    .select({ id: s.auditLog.subjectId, at: sql<Date>`max(${s.auditLog.createdAt})` })
    .from(s.auditLog)
    .where(and(eq(s.auditLog.action, "kyc.submitted"), inArray(s.auditLog.subjectId, rows.map((r) => r.p.id).length ? rows.map((r) => r.p.id) : ["-"])))
    .groupBy(s.auditLog.subjectId);
  const atBy = new Map(submittedAt.map((x) => [x.id, new Date(x.at)]));
  const items = rows
    .map(({ p, city }) => ({
      id: p.id,
      name: p.displayName,
      kind: p.kind,
      city: city ?? "",
      status: p.kycStatus,
      reverify: isReverification(p),
      resubmitted: p.kycRejections > 0,
      submittedAt: atBy.get(p.id) ?? p.createdAt,
    }))
    .sort((a, b) => a.submittedAt.getTime() - b.submittedAt.getTime());
  const counts = {
    submitted: items.filter((i) => !i.reverify && !i.resubmitted).length,
    resubmitted: items.filter((i) => !i.reverify && i.resubmitted).length,
    reverification_due: items.filter((i) => i.reverify).length,
  };
  const filtered =
    filter === "all"
      ? items
      : items.filter((i) => (filter === "reverification_due" ? i.reverify : !i.reverify && i.resubmitted === (filter === "resubmitted")));
  return { items: filtered, counts, total: items.length };
}

/** Other profiles sharing an identity or payout account with this one. */
export async function duplicates(db: Db, providerId: string) {
  const p = await profileOf(db, providerId);
  const conds = [
    p.citizenshipKey ? eq(s.providerProfiles.citizenshipKey, p.citizenshipKey) : undefined,
    p.passportKey ? eq(s.providerProfiles.passportKey, p.passportKey) : undefined,
    p.panNumber ? eq(s.providerProfiles.panNumber, p.panNumber) : undefined,
    p.payoutAccountNumber
      ? sql`upper(regexp_replace(translate(${s.providerProfiles.payoutAccountNumber}, '०१२३४५६७८९', '0123456789'), '[^0-9A-Za-z]', '', 'g')) = ${accountKey(p.payoutAccountNumber)}`
      : undefined,
  ].filter((c): c is NonNullable<typeof c> => !!c);
  if (conds.length === 0) return [];
  return db
    .select({ id: s.providerProfiles.id, name: s.providerProfiles.displayName })
    .from(s.providerProfiles)
    .where(and(ne(s.providerProfiles.id, p.id), or(...conds)));
}

/**
 * Opening a submission or a re-verification moves it to under_review, which
 * freezes the provider's edits: what the operator approves is what they saw.
 */
export async function startReview(deps: Deps, operatorId: string, providerId: string) {
  const moved = await deps.db
    .update(s.providerProfiles)
    .set({ kycStatus: "under_review" })
    .where(and(eq(s.providerProfiles.id, providerId), inArray(s.providerProfiles.kycStatus, ["submitted", "reverification_due"])))
    .returning();
  if (moved.length) {
    await audit(deps.db, { actorId: operatorId, action: "kyc.review_started", subjectType: "provider", subjectId: providerId });
    return moved[0];
  }
  return profileOf(deps.db, providerId);
}

/** A profile that was verified before and is now back in review. */
export function isReverification(p: { verifiedAt: Date | null; kycStatus: string }) {
  return p.verifiedAt != null && p.kycStatus !== "verified";
}

export async function decide(deps: Deps, operator: { id: string; role: string }, providerId: string, raw: unknown) {
  if (operator.role !== "operator" && operator.role !== "admin") throw new KycError("forbidden", "Operators only");
  const v = decisionInput.parse(raw);
  const checklist = Object.fromEntries(CHECKLIST.map((c) => [c.key, v.checklist[c.key] === true])) as Record<ChecklistKey, boolean>;
  const now = deps.now?.() ?? new Date();
  const today = todayInNepal(now);
  if (v.decision === "approve" && !Object.values(checklist).every(Boolean)) {
    throw new KycError("checklist_incomplete", "Approve needs all six checks.");
  }
  if (v.decision === "approve") {
    const dups = await duplicates(deps.db, providerId);
    if (dups.length) throw new KycError("duplicate", `Shares an ID, PAN or payout account with ${dups.map((d) => d.name).join(", ")}.`);
  }

  // Lock the profile row so two operators cannot both decide: the second
  // sees the new state and is refused.
  const p = await deps.db.transaction(async (tx) => {
    const [p] = await tx.select().from(s.providerProfiles).where(eq(s.providerProfiles.id, providerId)).for("update");
    if (!p) throw new KycError("not_found", "Provider not found");
    // A re-verification must be opened with startReview first, which freezes
    // edits; a first submission is already frozen once submitted.
    if (p.kycStatus !== "submitted" && p.kycStatus !== "under_review") {
      throw new KycError("wrong_state", p.kycStatus === "reverification_due" ? "Open the review first." : "This provider is not waiting for review.");
    }
    if (v.decision === "approve") {
      await tx
        .update(s.providerProfiles)
        .set({ kycStatus: "verified", verifiedAt: now, reverifyBy: addDays(today, REVERIFY_AFTER_DAYS) })
        .where(eq(s.providerProfiles.id, p.id));
    } else if (v.decision === "reject") {
      const rejections = p.kycRejections + 1;
      await tx.update(s.providerProfiles).set({ kycStatus: "rejected", kycRejections: rejections, verifiedAt: null }).where(eq(s.providerProfiles.id, p.id));
      if (rejections >= 2) {
        await tx
          .update(s.users)
          .set({ phoneLockedUntil: new Date(now.getTime() + REJECTION_LOCK_DAYS * 86_400_000) })
          .where(eq(s.users.id, p.userId));
      }
    } else {
      // Ask for a better photo: back to the provider, not counted as a rejection.
      await tx.update(s.providerProfiles).set({ kycStatus: "registered" }).where(eq(s.providerProfiles.id, p.id));
    }
    await tx.insert(s.kycReviews).values({ providerId: p.id, reviewerId: operator.id, decision: v.decision === "approve" ? "approved" : v.decision === "reject" ? "rejected" : "needs_better_photo", checklist, note: v.note ?? null });
    await tx.insert(s.auditLog).values({ actorId: operator.id, action: `kyc.${v.decision}`, subjectType: "provider", subjectId: p.id, detail: { checklist, note: v.note ?? null } });
    return p;
  });
  const [user] = await deps.db.select().from(s.users).where(eq(s.users.id, p.userId));

  const msg =
    v.decision === "approve"
      ? "Saait: you are verified. Your packages are live and clients can lock dates with you."
      : v.decision === "reject"
        ? `Saait: we could not verify you. ${v.note} ${p.kycRejections + 1 >= 2 ? "This was the second rejection; call us to talk it through." : "Fix this and send again from your account."}`
        : `Saait: please retake a photo. ${v.note}`;
  if (user) await deps.sms.send(user.phone, msg, "kyc_decision");
}

/** Operators and admins only; every view is audited. */
export async function readDocument(deps: Deps, viewer: { id: string; role: string }, documentId: string) {
  if (viewer.role !== "operator" && viewer.role !== "admin") throw new KycError("forbidden", "Operators only");
  const [d] = await deps.db.select().from(s.providerDocuments).where(eq(s.providerDocuments.id, documentId));
  if (!d) throw new KycError("not_found", "Document not found");
  const bytes = await deps.store.get(d.storageKey);
  await audit(deps.db, { actorId: viewer.id, action: "kyc.document_viewed", subjectType: "provider_document", subjectId: d.id });
  return { bytes, mimeType: d.mimeType };
}

function isUniqueViolation(e: unknown): boolean {
  const err = e as { code?: string; cause?: { code?: string } };
  return err?.code === "23505" || err?.cause?.code === "23505";
}
