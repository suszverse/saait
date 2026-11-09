/**
 * Operator review of held chat messages (proposal section 6, plan P3.T5).
 * The checker holds a message; the sender may appeal it; an operator either
 * clears it (a false positive, delivered to the recipient and taken out of
 * the sender's 30-day count) or confirms it (stays held, counts).
 *
 * Status values: 'held' means the recipient never sees it; 'cleared' is a
 * held message an operator released and is treated exactly like 'delivered'
 * by listThread in service.ts (visible to both sides). 'confirmed' lives in
 * review_outcome, not status: a confirmed message is still 'held'.
 *
 * The held count counts status 'held' only, so clearing removes a message
 * from the count and confirming leaves it in. The send service pauses chat
 * and freezes points at the third held message in 30 days; clear() lifts
 * that pause as soon as the count falls back below the threshold.
 */
import { and, desc, eq, gt, isNotNull, isNull, lt, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as s from "../db/schema";
import { audit } from "../audit";

type Db = PostgresJsDatabase<typeof s>;
type Operator = { id: string; role: string };

export class ModerationError extends Error {
  constructor(
    public readonly code: "forbidden" | "not_found" | "wrong_state",
    message: string,
  ) {
    super(message);
  }
}

/** Window and threshold from the proposal's strikes table: the 3rd held message in 30 days pauses chat. */
export const HELD_WINDOW_DAYS = 30;
export const PAUSE_THRESHOLD = 3;
const CONTEXT_SIZE = 5;

export type QueueContextMessage = {
  id: string;
  senderId: string;
  body: string;
  status: (typeof s.messageStatusEnum.enumValues)[number];
  createdAt: Date;
};

export type QueueItem = {
  id: string;
  threadId: string;
  body: string;
  layer: number | null;
  reason: string | null;
  appealed: boolean;
  appealedAt: Date | null;
  createdAt: Date;
  sender: { id: string; name: string | null; phone: string };
  /** The last 5 messages of the thread before this one, oldest first. */
  context: QueueContextMessage[];
};

function assertOperator(operator: Operator) {
  if (operator.role !== "operator" && operator.role !== "admin") throw new ModerationError("forbidden", "Only the review team can decide this.");
}

/** Rows still waiting for a decision: held and not yet reviewed. */
const waiting = () => and(eq(s.messages.status, "held"), isNull(s.messages.reviewOutcome));

/**
 * Held messages this user sent in the last 30 days. Confirmed messages stay
 * 'held' and so still count; cleared ones drop out. Exported for the send
 * service, which decides the notice, the review flag and the pause from it.
 */
export async function heldCountForUser(db: Db, userId: string, now: Date = new Date()): Promise<number> {
  const since = new Date(now.getTime() - HELD_WINDOW_DAYS * 86_400_000);
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(s.messages)
    .where(and(eq(s.messages.senderId, userId), eq(s.messages.status, "held"), gt(s.messages.createdAt, since)));
  return row?.n ?? 0;
}

/** Number of rows heldQueue would return; feeds the sidebar badge. */
export async function heldCount(db: Db): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(s.messages).where(waiting());
  return row?.n ?? 0;
}

/** Appealed messages first (the sender is waiting on us), then oldest first. */
export async function heldQueue(db: Db): Promise<QueueItem[]> {
  const rows = await db
    .select({
      id: s.messages.id,
      threadId: s.messages.threadId,
      body: s.messages.body,
      layer: s.messages.heldLayer,
      reason: s.messages.reason,
      appealedAt: s.messages.appealedAt,
      createdAt: s.messages.createdAt,
      senderId: s.users.id,
      senderName: s.users.name,
      senderPhone: s.users.phone,
    })
    .from(s.messages)
    .innerJoin(s.users, eq(s.users.id, s.messages.senderId))
    .where(and(waiting(), isNotNull(s.messages.threadId)))
    .orderBy(desc(isNotNull(s.messages.appealedAt)), s.messages.createdAt);

  return Promise.all(
    rows.map(async (r) => {
      // threadId is non-null by the where clause; the join type cannot express that.
      const threadId = r.threadId as string;
      const before = await db
        .select({ id: s.messages.id, senderId: s.messages.senderId, body: s.messages.body, status: s.messages.status, createdAt: s.messages.createdAt })
        .from(s.messages)
        .where(and(eq(s.messages.threadId, threadId), lt(s.messages.createdAt, r.createdAt)))
        .orderBy(desc(s.messages.createdAt))
        .limit(CONTEXT_SIZE);
      return {
        id: r.id,
        threadId,
        body: r.body,
        layer: r.layer,
        reason: r.reason,
        appealed: r.appealedAt != null,
        appealedAt: r.appealedAt,
        createdAt: r.createdAt,
        sender: { id: r.senderId, name: r.senderName, phone: r.senderPhone },
        context: before.reverse(),
      };
    }),
  );
}

/**
 * A false positive. The message becomes 'cleared', which listThread shows to
 * the recipient like a delivered one. The sender's 30-day count is recomputed
 * and, if it fell below the threshold, the pause that the third message set
 * is lifted. The pause sets chat_paused_until and points_frozen_until
 * together, so both are cleared when chat_paused_until is set.
 */
export async function clear(db: Db, operator: Operator, messageId: string, now: Date = new Date()) {
  assertOperator(operator);
  return db.transaction(async (tx) => {
    const [m] = await tx.select().from(s.messages).where(eq(s.messages.id, messageId)).for("update");
    if (!m) throw new ModerationError("not_found", "Message not found");
    if (m.status !== "held" || m.reviewOutcome != null) throw new ModerationError("wrong_state", "This message has already been decided.");

    await tx
      .update(s.messages)
      .set({ status: "cleared", reviewOutcome: "cleared", reviewedById: operator.id, reviewedAt: now })
      .where(eq(s.messages.id, m.id));

    const remaining = await heldCountForUser(tx, m.senderId, now);
    let pauseLifted = false;
    if (remaining < PAUSE_THRESHOLD) {
      const lifted = await tx
        .update(s.users)
        .set({ chatPausedUntil: null, pointsFrozenUntil: null })
        .where(and(eq(s.users.id, m.senderId), isNotNull(s.users.chatPausedUntil)))
        .returning({ id: s.users.id });
      pauseLifted = lifted.length > 0;
    }

    await audit(tx, {
      actorId: operator.id,
      action: "chat.cleared",
      subjectType: "message",
      subjectId: m.id,
      detail: { senderId: m.senderId, threadId: m.threadId, layer: m.heldLayer, appealed: m.appealedAt != null, heldCountAfter: remaining, pauseLifted },
    });
    return { remaining, pauseLifted };
  });
}

/** The hold stands. The message stays 'held' and in the count; only the review fields change. */
export async function confirm(db: Db, operator: Operator, messageId: string, now: Date = new Date()) {
  assertOperator(operator);
  return db.transaction(async (tx) => {
    const [m] = await tx.select().from(s.messages).where(eq(s.messages.id, messageId)).for("update");
    if (!m) throw new ModerationError("not_found", "Message not found");
    if (m.status !== "held" || m.reviewOutcome != null) throw new ModerationError("wrong_state", "This message has already been decided.");

    await tx
      .update(s.messages)
      .set({ reviewOutcome: "confirmed", reviewedById: operator.id, reviewedAt: now })
      .where(eq(s.messages.id, m.id));

    await audit(tx, {
      actorId: operator.id,
      action: "chat.confirmed",
      subjectType: "message",
      subjectId: m.id,
      detail: { senderId: m.senderId, threadId: m.threadId, layer: m.heldLayer, appealed: m.appealedAt != null },
    });
  });
}
