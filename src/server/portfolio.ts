/**
 * Portfolio uploads (docs/proposals/leakage-and-rewards.md section 11, plan
 * P5.T8). A provider adds photos and clips up to the limit their plan or
 * level buys; every file is sniffed, size-checked, measured (clips) and run
 * through the screener before it is stored. The row's status is the
 * screener's verdict: approved shows to clients, pending waits for an
 * operator, held shows the provider the reason and nothing to anyone else.
 *
 * Held items do not count against the limit, so a provider whose photo was
 * refused can upload a replacement straight away.
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import { limitsFor, MAX_CLIP_BYTES, MAX_CLIP_SECONDS, MAX_PHOTO_BYTES } from "@/lib/portfolio-limits";
import { audit } from "./audit";
import * as s from "./db/schema";
import type { Db } from "./providers";
import { levelsFor } from "./rewards/ledger";
import { QrScanError, type Screener } from "./screening";
import { sniffPortfolioType, type DocumentStore, type PortfolioType } from "./storage";

export type Deps = { db: Db; store: DocumentStore; screener: Screener; now?: () => Date };
type Actor = { id: string; role: string };
type MediaKind = (typeof s.mediaKindEnum.enumValues)[number];
type MediaStatus = (typeof s.mediaStatusEnum.enumValues)[number];

export class PortfolioError extends Error {
  constructor(
    public readonly code: "not_found" | "forbidden" | "unsupported_type" | "bad_file" | "too_large" | "too_long" | "limit_reached",
    message: string,
  ) {
    super(message);
  }
}

export type UploadFile = { bytes: Uint8Array; mime: string; filename?: string };
export type UploadResult = { id: string; status: MediaStatus; reason: string | null };

const isOperator = (a: Actor) => a.role === "operator" || a.role === "admin";
const mediaKindOf = (type: PortfolioType): MediaKind => (type.startsWith("video/") ? "clip" : "photo");
const mb = (bytes: number) => Math.round(bytes / (1024 * 1024));

/**
 * Clip length from the `mvhd` box inside `moov` (ISO 14496-12, also what a
 * QuickTime file carries). Returns null when the header is not where a
 * finished export puts it; the caller refuses the file rather than trusting
 * an unmeasured clip. Exported for the tests that build a header by hand.
 */
export function readClipDuration(bytes: Uint8Array): number | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const boxes = function* (start: number, end: number) {
    let at = start;
    while (at + 8 <= end) {
      let size = view.getUint32(at);
      let header = 8;
      if (size === 1) {
        if (at + 16 > end) return;
        // 64-bit largesize: the high word is zero for anything that fits in memory.
        size = view.getUint32(at + 8) * 2 ** 32 + view.getUint32(at + 12);
        header = 16;
      } else if (size === 0) size = end - at;
      if (size < header || at + size > end) return;
      yield { type: String.fromCharCode(...bytes.slice(at + 4, at + 8)), body: at + header, end: at + size };
      at += size;
    }
  };
  for (const box of boxes(0, bytes.byteLength)) {
    if (box.type !== "moov") continue;
    for (const inner of boxes(box.body, box.end)) {
      if (inner.type !== "mvhd") continue;
      const version = view.getUint8(inner.body);
      const timescale = view.getUint32(inner.body + (version === 1 ? 20 : 12));
      const duration =
        version === 1 ? view.getUint32(inner.body + 24) * 2 ** 32 + view.getUint32(inner.body + 28) : view.getUint32(inner.body + 16);
      if (timescale === 0) return null;
      return duration / timescale;
    }
  }
  return null;
}

/** Non-held items the provider already has of this kind, which is what the limit counts. */
async function countUsed(db: Db, providerId: string, mediaKind: MediaKind): Promise<number> {
  const rows = await db
    .select({ id: s.portfolioItems.id })
    .from(s.portfolioItems)
    .where(and(eq(s.portfolioItems.providerId, providerId), eq(s.portfolioItems.mediaKind, mediaKind), inArray(s.portfolioItems.status, ["pending", "approved"])));
  return rows.length;
}

export async function uploadPortfolioItem(deps: Deps, providerProfileId: string, file: UploadFile): Promise<UploadResult> {
  const { db } = deps;
  const [p] = await db.select().from(s.providerProfiles).where(eq(s.providerProfiles.id, providerProfileId));
  if (!p) throw new PortfolioError("not_found", "Provider not found");

  const type = sniffPortfolioType(file.bytes);
  if (!type) throw new PortfolioError("unsupported_type", "Upload a photo (JPEG, PNG or WebP) or a clip (MP4 or MOV).");
  const mediaKind = mediaKindOf(type);
  const maxBytes = mediaKind === "photo" ? MAX_PHOTO_BYTES : MAX_CLIP_BYTES;
  if (file.bytes.byteLength > maxBytes) {
    throw new PortfolioError("too_large", `That ${mediaKind} is over ${mb(maxBytes)} MB. Export it again at a smaller size.`);
  }

  let durationSeconds: number | null = null;
  if (mediaKind === "clip") {
    const seconds = readClipDuration(file.bytes);
    if (seconds === null) throw new PortfolioError("bad_file", "We could not read this clip. Export it again as MP4.");
    if (seconds > MAX_CLIP_SECONDS) {
      throw new PortfolioError("too_long", `Clips are up to ${MAX_CLIP_SECONDS} seconds. Trim it and upload again.`);
    }
    durationSeconds = Math.ceil(seconds);
  }

  const level = (await levelsFor(db, [p.userId])).get(p.userId) ?? "New";
  const limit = limitsFor({ kind: p.kind, plan: p.plan, level })[mediaKind === "photo" ? "photos" : "clips"];
  if ((await countUsed(db, p.id, mediaKind)) >= limit) {
    throw new PortfolioError("limit_reached", `You have used all ${limit} ${mediaKind} slots. Remove one to add another.`);
  }

  let verdict;
  try {
    verdict = await deps.screener.screen({ bytes: file.bytes, mime: type, mediaKind });
  } catch (e) {
    if (e instanceof QrScanError) throw new PortfolioError("bad_file", "We could not read this photo. Export it again as JPEG.");
    throw e;
  }
  const status: MediaStatus = verdict.verdict === "approve" ? "approved" : verdict.verdict === "hold" ? "held" : "pending";

  const storageKey = await deps.store.put(file.bytes);
  const [row] = await db
    .insert(s.portfolioItems)
    .values({
      providerId: p.id,
      kind: mediaKind === "photo" ? "image" : "video",
      mediaKind,
      storageKey,
      status,
      reason: verdict.reason ?? null,
      durationSeconds,
      bytes: file.bytes.byteLength,
      createdAt: deps.now?.(),
    })
    .returning({ id: s.portfolioItems.id, status: s.portfolioItems.status, reason: s.portfolioItems.reason });
  return row;
}

async function requireItem(db: Db, id: string) {
  const [item] = await db
    .select({ id: s.portfolioItems.id, providerId: s.portfolioItems.providerId, storageKey: s.portfolioItems.storageKey, ownerId: s.providerProfiles.userId })
    .from(s.portfolioItems)
    .innerJoin(s.providerProfiles, eq(s.providerProfiles.id, s.portfolioItems.providerId))
    .where(eq(s.portfolioItems.id, id));
  if (!item) throw new PortfolioError("not_found", "Portfolio item not found");
  return item;
}

export async function approveItem(db: Db, operator: Actor, id: string): Promise<void> {
  if (!isOperator(operator)) throw new PortfolioError("forbidden", "Operators only");
  const item = await requireItem(db, id);
  await db.update(s.portfolioItems).set({ status: "approved", reason: null }).where(eq(s.portfolioItems.id, item.id));
  await audit(db, { actorId: operator.id, action: "portfolio.approved", subjectType: "portfolio_item", subjectId: item.id });
}

export async function holdItem(db: Db, operator: Actor, id: string, reason: string): Promise<void> {
  if (!isOperator(operator)) throw new PortfolioError("forbidden", "Operators only");
  const item = await requireItem(db, id);
  await db.update(s.portfolioItems).set({ status: "held", reason }).where(eq(s.portfolioItems.id, item.id));
  await audit(db, { actorId: operator.id, action: "portfolio.held", subjectType: "portfolio_item", subjectId: item.id, detail: { reason } });
}

/** A provider removes their own item; the stored file goes with the row. */
export async function removeItem(deps: Pick<Deps, "db" | "store">, owner: Actor, id: string): Promise<void> {
  const item = await requireItem(deps.db, id);
  if (item.ownerId !== owner.id) throw new PortfolioError("forbidden", "Not your portfolio");
  await deps.db.delete(s.portfolioItems).where(eq(s.portfolioItems.id, item.id));
  if (item.storageKey) await deps.store.delete(item.storageKey);
}

/** Clients see approved items; the owner and operators see everything, including the hold reasons. */
export async function listPortfolio(db: Db, providerProfileId: string, viewer?: Actor) {
  const [p] = await db.select({ userId: s.providerProfiles.userId }).from(s.providerProfiles).where(eq(s.providerProfiles.id, providerProfileId));
  if (!p) throw new PortfolioError("not_found", "Provider not found");
  const seesAll = viewer !== undefined && (viewer.id === p.userId || isOperator(viewer));
  return db
    .select()
    .from(s.portfolioItems)
    .where(and(eq(s.portfolioItems.providerId, providerProfileId), seesAll ? undefined : eq(s.portfolioItems.status, "approved")))
    .orderBy(asc(s.portfolioItems.position), asc(s.portfolioItems.createdAt));
}
