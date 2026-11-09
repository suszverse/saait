/**
 * Chat send service (proposal section 6, plan P3.T4). Threads are opened
 * between a client and a business, or between a business and a freelancer it
 * is hiring. Every text runs through check() before delivery; a hold is
 * visible only to its sender and counts towards the 30-day strikes that
 * moderation.ts reviews. Images unlock once a deposit has been paid between
 * the two sides and are scanned for QR codes before storage.
 *
 * Every entry point takes the viewer and refuses anyone who is not one of the
 * thread's two parties; the operator side lives in moderation.ts.
 */
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { audit } from "../audit";
import * as s from "../db/schema";
import type { Db } from "../providers";
import { containsQr, SCANNABLE_MIMES } from "../screening/qr";
import { type DocumentStore, MAX_DOCUMENT_BYTES, sniffType } from "../storage";
import { check, REASONS } from "./check";
import { heldCountForUser, PAUSE_THRESHOLD } from "./moderation";

export type Viewer = { id: string; role: string };

export class ChatError extends Error {
  constructor(
    public readonly code: "forbidden" | "not_found" | "paused" | "images_locked" | "bad_input" | "wrong_state",
    message: string,
  ) {
    super(message);
  }
}

/** The third held message in 30 days pauses chat and freezes points for this long. */
export const PAUSE_HOURS = 24;
const CONTEXT_SIZE = 5;
/** The QR layer in messages.held_layer; 1 and 2 come from check(). */
const IMAGE_LAYER = 3;

export const messageBody = z.string().trim().min(1).max(2000);

/** Statuses a booking reaches only after its deposit has settled. */
const DEPOSIT_PAID = ["confirmed", "in_progress", "delivered", "completed", "disputed"] as const;

export type Message = typeof s.messages.$inferSelect;
export type Thread = typeof s.chatThreads.$inferSelect;

/** Sorted so the same two people always land in the same (a, b) slots and the unique index dedupes. */
function orderPair(x: string, y: string): [string, string] {
  return x < y ? [x, y] : [y, x];
}

async function loadThread(db: Db, viewer: Viewer, threadId: string): Promise<Thread> {
  const [t] = await db.select().from(s.chatThreads).where(eq(s.chatThreads.id, threadId));
  if (!t) throw new ChatError("not_found", "That conversation could not be found.");
  if (t.aUserId !== viewer.id && t.bUserId !== viewer.id) throw new ChatError("forbidden", "This conversation is not yours.");
  return t;
}

async function assertNotPaused(db: Db, viewer: Viewer, now: Date) {
  const [u] = await db.select({ pausedUntil: s.users.chatPausedUntil }).from(s.users).where(eq(s.users.id, viewer.id));
  if (!u) throw new ChatError("not_found", "Account not found.");
  if (u.pausedUntil && u.pausedUntil > now) throw new ChatError("paused", "Chat is paused on your account until the review team has looked at your recent messages.");
}

/**
 * Creates or returns the thread between the viewer and the provider's user.
 * A client opening a thread with a business gets client_business, keyed by
 * the day when one is given; a business opening one with a freelancer gets
 * business_crew. Nobody can open a thread with themselves.
 */
export async function openThread(db: Db, viewer: Viewer, input: { providerId: string; day?: string | null }): Promise<Thread> {
  const [target] = await db
    .select({ userId: s.providerProfiles.userId, kind: s.providerProfiles.kind })
    .from(s.providerProfiles)
    .where(eq(s.providerProfiles.id, input.providerId));
  if (!target) throw new ChatError("not_found", "That provider could not be found.");
  if (target.userId === viewer.id) throw new ChatError("forbidden", "You cannot open a conversation with yourself.");

  const [own] = await db
    .select({ kind: s.providerProfiles.kind })
    .from(s.providerProfiles)
    .where(eq(s.providerProfiles.userId, viewer.id));
  const viewerIsBusiness = own?.kind === "studio";

  let kind: (typeof s.threadKindEnum.enumValues)[number];
  if (target.kind === "freelancer") {
    if (!viewerIsBusiness) throw new ChatError("forbidden", "Crew can only be contacted by a business.");
    kind = "business_crew";
  } else {
    kind = "client_business";
  }
  // Crew threads carry neither a booking nor a day.
  const day = kind === "client_business" ? (input.day ?? null) : null;

  const [a, b] = orderPair(viewer.id, target.userId);
  await db
    .insert(s.chatThreads)
    .values({ kind, aUserId: a, bUserId: b, providerId: input.providerId, day })
    .onConflictDoNothing();
  const [t] = await db
    .select()
    .from(s.chatThreads)
    .where(
      and(
        eq(s.chatThreads.aUserId, a),
        eq(s.chatThreads.bUserId, b),
        eq(s.chatThreads.providerId, input.providerId),
        day ? eq(s.chatThreads.day, day) : isNull(s.chatThreads.day),
      ),
    );
  return t;
}

/** The last five bodies in the thread, oldest first, for the cross-message layer of check(). */
async function recentBodies(db: Db, threadId: string): Promise<string[]> {
  const rows = await db
    .select({ body: s.messages.body })
    .from(s.messages)
    .where(eq(s.messages.threadId, threadId))
    .orderBy(desc(s.messages.createdAt))
    .limit(CONTEXT_SIZE);
  return rows.map((r) => r.body).reverse();
}

/**
 * Stores a held message and applies the strikes rule: the second hold in 30
 * days needs nothing extra (the review queue already shows it); the third
 * pauses chat and freezes points for 24 hours and is audited.
 */
async function hold(
  db: Db,
  viewer: Viewer,
  thread: Thread,
  values: { body: string; reason: string; heldLayer: number },
  now: Date,
): Promise<Message> {
  return db.transaction(async (tx) => {
    const [m] = await tx
      .insert(s.messages)
      .values({ threadId: thread.id, senderId: viewer.id, status: "held", createdAt: now, ...values })
      .returning();
    const count = await heldCountForUser(tx, viewer.id, now);
    if (count >= PAUSE_THRESHOLD) {
      const until = new Date(now.getTime() + PAUSE_HOURS * 3_600_000);
      await tx.update(s.users).set({ chatPausedUntil: until, pointsFrozenUntil: until }).where(eq(s.users.id, viewer.id));
      await audit(tx, {
        actorId: viewer.id,
        action: "chat.paused",
        subjectType: "user",
        subjectId: viewer.id,
        detail: { messageId: m.id, threadId: thread.id, heldCount: count, until },
      });
    }
    return m;
  });
}

async function deliver(db: Db, viewer: Viewer, thread: Thread, values: { body: string; attachmentKey?: string }, now: Date): Promise<Message> {
  return db.transaction(async (tx) => {
    const [m] = await tx
      .insert(s.messages)
      .values({ threadId: thread.id, senderId: viewer.id, status: "delivered", createdAt: now, ...values })
      .returning();
    await tx.update(s.chatThreads).set({ lastMessageAt: now }).where(eq(s.chatThreads.id, thread.id));
    return m;
  });
}

/** Checks the text and stores it as delivered or held. The returned row's status tells the caller which. */
export async function sendMessage(db: Db, viewer: Viewer, threadId: string, body: string, now: Date = new Date()): Promise<Message> {
  const parsed = messageBody.safeParse(body);
  if (!parsed.success) throw new ChatError("bad_input", "A message is between 1 and 2000 characters.");
  const thread = await loadThread(db, viewer, threadId);
  await assertNotPaused(db, viewer, now);

  const result = check(parsed.data, await recentBodies(db, thread.id));
  if (!result.ok) return hold(db, viewer, thread, { body: parsed.data, reason: result.reason, heldLayer: result.layer }, now);
  return deliver(db, viewer, thread, { body: parsed.data }, now);
}

/** True when a booking linking the thread's two sides to this provider has had its deposit paid. */
async function depositPaid(db: Db, thread: Thread): Promise<boolean> {
  const paid = [...DEPOSIT_PAID];
  if (thread.bookingId) {
    const [b] = await db.select({ status: s.bookings.status }).from(s.bookings).where(eq(s.bookings.id, thread.bookingId));
    return b != null && (paid as string[]).includes(b.status);
  }
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(s.bookings)
    .where(
      and(
        eq(s.bookings.providerId, thread.providerId),
        inArray(s.bookings.clientId, [thread.aUserId, thread.bUserId]),
        inArray(s.bookings.status, paid),
      ),
    );
  return (row?.n ?? 0) > 0;
}

/**
 * Images are locked until a deposit has been paid, then scanned: a QR code
 * is held like a payment detail (layer 3); anything else is stored privately
 * and delivered with its attachment key. The browser's mime label is ignored
 * in favour of the sniffed type.
 */
export async function sendImage(
  db: Db,
  viewer: Viewer,
  threadId: string,
  image: { bytes: Uint8Array; mime: string },
  deps: { store: DocumentStore; now?: Date },
): Promise<Message> {
  const now = deps.now ?? new Date();
  const thread = await loadThread(db, viewer, threadId);
  await assertNotPaused(db, viewer, now);
  if (!(await depositPaid(db, thread))) throw new ChatError("images_locked", "Photos can be shared once a deposit has been paid.");

  if (image.bytes.length > MAX_DOCUMENT_BYTES) throw new ChatError("bad_input", "That image is too large.");
  const type = sniffType(image.bytes);
  if (!type || !(SCANNABLE_MIMES as readonly string[]).includes(type)) throw new ChatError("bad_input", "Only JPEG, PNG and WebP images can be shared.");

  const qr = await containsQr(image.bytes, type);
  if (qr.found) return hold(db, viewer, thread, { body: "", reason: REASONS.payment, heldLayer: IMAGE_LAYER }, now);
  const attachmentKey = await deps.store.put(image.bytes);
  return deliver(db, viewer, thread, { body: "", attachmentKey }, now);
}

/** The sender asks for a review of their own held message; the queue lists appealed ones first. */
export async function appeal(db: Db, viewer: Viewer, messageId: string, now: Date = new Date()): Promise<Message> {
  const [m] = await db.select().from(s.messages).where(eq(s.messages.id, messageId));
  if (!m) throw new ChatError("not_found", "That message could not be found.");
  if (m.senderId !== viewer.id) throw new ChatError("forbidden", "You can only appeal your own messages.");
  if (m.status !== "held") throw new ChatError("wrong_state", "Only a held message can be appealed.");
  if (m.appealedAt) return m;
  const [after] = await db.update(s.messages).set({ appealedAt: now }).where(eq(s.messages.id, m.id)).returning();
  return after;
}

/** Delivered and cleared messages for both sides; held ones only to whoever sent them. */
export async function listThread(db: Db, viewer: Viewer, threadId: string): Promise<Message[]> {
  const thread = await loadThread(db, viewer, threadId);
  return db
    .select()
    .from(s.messages)
    .where(
      and(
        eq(s.messages.threadId, thread.id),
        or(inArray(s.messages.status, ["delivered", "cleared"]), and(eq(s.messages.status, "held"), eq(s.messages.senderId, viewer.id))),
      ),
    )
    .orderBy(s.messages.createdAt);
}
