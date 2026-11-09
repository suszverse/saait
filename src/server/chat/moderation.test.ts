import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as s from "../db/schema";
import { clear, confirm, heldCount, heldCountForUser, heldQueue, ModerationError, PAUSE_THRESHOLD } from "./moderation";

const client = postgres(process.env.DATABASE_URL_TEST ?? "", { max: 1, onnotice: () => {} });
const db = drizzle(client, { schema: s, casing: "snake_case" });

const NOW = new Date("2026-11-09T06:00:00Z");
const DAY = 86_400_000;
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);

let operator: { id: string; role: string };
let client1: { id: string; role: string };
let business: { id: string; role: string };
let threadId: string;

async function newUser(phone: string, role: "client" | "provider" | "operator" | "admin", name?: string) {
  const [u] = await db.insert(s.users).values({ phone, role, name }).returning();
  return { id: u.id, role: u.role };
}

async function post(
  senderId: string,
  body: string,
  opts: { status?: "held" | "delivered" | "cleared"; layer?: number; reason?: string; appealedAt?: Date; createdAt?: Date; threadId?: string } = {},
) {
  const [m] = await db
    .insert(s.messages)
    .values({
      threadId: opts.threadId ?? threadId,
      senderId,
      body,
      status: opts.status ?? "delivered",
      heldLayer: opts.layer ?? null,
      reason: opts.reason ?? null,
      appealedAt: opts.appealedAt ?? null,
      createdAt: opts.createdAt ?? NOW,
    })
    .returning();
  return m;
}

const held = (senderId: string, body: string, opts: Parameters<typeof post>[2] = {}) =>
  post(senderId, body, { status: "held", layer: 2, reason: "Phone numbers can't be shared on Saait.", ...opts });

async function expectModeration(p: Promise<unknown>, code: ModerationError["code"]) {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof ModerationError && e.code === code);
}

async function truncate(attempt = 0): Promise<void> {
  try {
    await client`truncate table users, cities, service_categories, auspicious_dates restart identity cascade`;
  } catch (e) {
    // Another test file may be resetting the shared test database right now.
    if (attempt < 10 && /does not exist/.test(String(e))) {
      await new Promise((r) => setTimeout(r, 500));
      return truncate(attempt + 1);
    }
    throw e;
  }
}

beforeEach(async () => {
  await truncate();
  operator = await newUser("+9779800000900", "operator");
  client1 = await newUser("+9779800000101", "client", "Sita");
  business = await newUser("+9779800000102", "provider");
  const [p] = await db.insert(s.providerProfiles).values({ userId: business.id, slug: "anita", displayName: "Anita Studio", alias: "Crew T1-001" }).returning();
  const [t] = await db
    .insert(s.chatThreads)
    .values({ kind: "client_business", aUserId: client1.id, bUserId: business.id, providerId: p.id })
    .returning();
  threadId = t.id;
});
afterAll(async () => {
  await client.end();
});

describe("heldQueue", () => {
  it("lists appealed messages first, then oldest first, with the last five messages as context", async () => {
    for (let i = 1; i <= 7; i++) await post(client1.id, `earlier ${i}`, { createdAt: hoursAgo(10 - i) });
    const older = await held(client1.id, "older, not appealed", { createdAt: hoursAgo(2) });
    const newer = await held(client1.id, "newer, not appealed", { createdAt: hoursAgo(1) });
    const appealed = await held(business.id, "appealed", { createdAt: hoursAgo(0.5), appealedAt: NOW });
    await post(client1.id, "a delivered one", { createdAt: NOW });
    await held(client1.id, "already cleared", { status: "cleared", createdAt: NOW });

    const queue = await heldQueue(db);
    expect(queue.map((q) => q.id)).toEqual([appealed.id, older.id, newer.id]);
    expect(await heldCount(db)).toBe(3);

    const first = queue[0];
    expect(first.appealed).toBe(true);
    expect(first.threadId).toBe(threadId);
    expect(first.layer).toBe(2);
    expect(first.reason).toMatch(/Phone numbers/);
    expect(first.sender.id).toBe(business.id);
    expect(first.context).toHaveLength(5);
    expect(first.context.map((c) => c.body)).toEqual(["earlier 5", "earlier 6", "earlier 7", "older, not appealed", "newer, not appealed"]);
    expect(queue[1].sender.name).toBe("Sita");
    expect(queue[1].appealed).toBe(false);
  });

  it("drops a row after either decision", async () => {
    const a = await held(client1.id, "one");
    const b = await held(client1.id, "two", { createdAt: hoursAgo(1) });
    await clear(db, operator, a.id, NOW);
    expect((await heldQueue(db)).map((q) => q.id)).toEqual([b.id]);
    await confirm(db, operator, b.id, NOW);
    expect(await heldQueue(db)).toEqual([]);
    expect(await heldCount(db)).toBe(0);
  });
});

describe("clear", () => {
  it("marks the message cleared with the reviewer and writes an audit row", async () => {
    const m = await held(client1.id, "500 photos, 10 hours, Falgun 12", { appealedAt: NOW });
    await clear(db, operator, m.id, NOW);

    const [after] = await db.select().from(s.messages).where(eq(s.messages.id, m.id));
    expect(after.status).toBe("cleared");
    expect(after.reviewOutcome).toBe("cleared");
    expect(after.reviewedById).toBe(operator.id);
    expect(after.reviewedAt).toEqual(NOW);

    const logs = await db.select().from(s.auditLog).where(eq(s.auditLog.action, "chat.cleared"));
    expect(logs).toHaveLength(1);
    expect(logs[0].actorId).toBe(operator.id);
    expect(logs[0].subjectType).toBe("message");
    expect(logs[0].subjectId).toBe(m.id);
    expect(logs[0].detail).toMatchObject({ senderId: client1.id, appealed: true, heldCountAfter: 0 });
  });

  it("lifts the pause once the 30-day count falls below the threshold", async () => {
    const pausedUntil = new Date(NOW.getTime() + DAY);
    await db.update(s.users).set({ chatPausedUntil: pausedUntil, pointsFrozenUntil: pausedUntil }).where(eq(s.users.id, client1.id));
    const strikes = [];
    for (let i = 0; i < PAUSE_THRESHOLD; i++) strikes.push(await held(client1.id, `held ${i}`, { createdAt: hoursAgo(i + 1) }));
    // One outside the window must not count.
    await held(client1.id, "old", { createdAt: new Date(NOW.getTime() - 31 * DAY) });
    expect(await heldCountForUser(db, client1.id, NOW)).toBe(PAUSE_THRESHOLD);

    const r = await clear(db, operator, strikes[0].id, NOW);
    expect(r).toEqual({ remaining: PAUSE_THRESHOLD - 1, pauseLifted: true });
    expect(await heldCountForUser(db, client1.id, NOW)).toBe(PAUSE_THRESHOLD - 1);
    const [u] = await db.select().from(s.users).where(eq(s.users.id, client1.id));
    expect(u.chatPausedUntil).toBeNull();
    expect(u.pointsFrozenUntil).toBeNull();
    const [log] = await db.select().from(s.auditLog).where(eq(s.auditLog.action, "chat.cleared"));
    expect(log.detail).toMatchObject({ pauseLifted: true, heldCountAfter: PAUSE_THRESHOLD - 1 });
  });

  it("keeps the pause while the count is still at the threshold", async () => {
    const pausedUntil = new Date(NOW.getTime() + DAY);
    await db.update(s.users).set({ chatPausedUntil: pausedUntil, pointsFrozenUntil: pausedUntil }).where(eq(s.users.id, client1.id));
    const strikes = [];
    for (let i = 0; i <= PAUSE_THRESHOLD; i++) strikes.push(await held(client1.id, `held ${i}`, { createdAt: hoursAgo(i + 1) }));

    const r = await clear(db, operator, strikes[0].id, NOW);
    expect(r).toEqual({ remaining: PAUSE_THRESHOLD, pauseLifted: false });
    const [u] = await db.select().from(s.users).where(eq(s.users.id, client1.id));
    expect(u.chatPausedUntil).toEqual(pausedUntil);
    expect(u.pointsFrozenUntil).toEqual(pausedUntil);
  });

  it("refuses a second decision and unknown ids", async () => {
    const m = await held(client1.id, "once");
    await clear(db, operator, m.id, NOW);
    await expectModeration(clear(db, operator, m.id, NOW), "wrong_state");
    await expectModeration(confirm(db, operator, m.id, NOW), "wrong_state");
    await expectModeration(clear(db, operator, "00000000-0000-0000-0000-000000000000", NOW), "not_found");
  });
});

describe("confirm", () => {
  it("keeps the message held and in the count, records the outcome and audits", async () => {
    const m = await held(client1.id, "call 9841234567");
    await confirm(db, operator, m.id, NOW);

    const [after] = await db.select().from(s.messages).where(eq(s.messages.id, m.id));
    expect(after.status).toBe("held");
    expect(after.reviewOutcome).toBe("confirmed");
    expect(after.reviewedById).toBe(operator.id);
    expect(after.reviewedAt).toEqual(NOW);
    expect(await heldCountForUser(db, client1.id, NOW)).toBe(1);

    const logs = await db.select().from(s.auditLog).where(eq(s.auditLog.action, "chat.confirmed"));
    expect(logs).toHaveLength(1);
    expect(logs[0].actorId).toBe(operator.id);
    expect(logs[0].subjectId).toBe(m.id);
  });
});

describe("roles", () => {
  it("only operators and admins decide", async () => {
    const m = await held(client1.id, "x");
    await expectModeration(clear(db, client1, m.id, NOW), "forbidden");
    await expectModeration(confirm(db, business, m.id, NOW), "forbidden");
    const [after] = await db.select().from(s.messages).where(eq(s.messages.id, m.id));
    expect(after.status).toBe("held");
    expect(after.reviewOutcome).toBeNull();
    expect(await db.select().from(s.auditLog)).toHaveLength(0);

    const admin = await newUser("+9779800000901", "admin");
    await confirm(db, admin, m.id, NOW);
    const [decided] = await db.select().from(s.messages).where(eq(s.messages.id, m.id));
    expect(decided.reviewedById).toBe(admin.id);
  });
});
