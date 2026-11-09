import { readFile } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { rupees } from "@/lib/money";
import * as s from "../db/schema";
import type { DocumentStore } from "../storage";
import { appeal, ChatError, listThread, openThread, PAUSE_HOURS, sendImage, sendMessage } from "./service";

const client = postgres(process.env.DATABASE_URL_TEST ?? "", { max: 1, onnotice: () => {} });
const db = drizzle(client, { schema: s, casing: "snake_case" });

const NOW = new Date("2026-11-09T06:00:00Z");
const DAY = 86_400_000;
const minutesLater = (m: number) => new Date(NOW.getTime() + m * 60_000);
const fixture = (name: string) => readFile(path.join(import.meta.dirname, "..", "screening", "fixtures", name));

const PHONE = "call me on 9841234567";

let sita: { id: string; role: string };
let anita: { id: string; role: string };
let stranger: { id: string; role: string };
let crew: { id: string; role: string };
let studioId: string;
let crewId: string;
let threadId: string;
let n = 0;

/** Keeps bytes in memory; the service only needs put() to hand back a key. */
function memoryStore(): DocumentStore & { files: Map<string, Uint8Array> } {
  const files = new Map<string, Uint8Array>();
  return {
    files,
    async put(bytes) {
      const key = `mem-${files.size + 1}`;
      files.set(key, bytes);
      return key;
    },
    async get(key) {
      const f = files.get(key);
      if (!f) throw new Error("missing");
      return f;
    },
    async delete(key) {
      files.delete(key);
    },
  };
}

async function newUser(phone: string, role: "client" | "provider" | "operator" | "admin", name?: string) {
  const [u] = await db.insert(s.users).values({ phone, role, name }).returning();
  return { id: u.id, role: u.role };
}

async function booking(status: (typeof s.bookingStatusEnum.enumValues)[number], clientId = sita.id, providerId = studioId) {
  const [b] = await db
    .insert(s.bookings)
    .values({
      code: `CS-${++n}`,
      clientId,
      providerId,
      day: "2027-02-24",
      status,
      venue: "Siddhartha Party Palace, Butwal",
      contactPhone: "+9779800000101",
      packageName: "Standard",
      packagePrice: rupees(70_000),
      agreedTotal: rupees(70_000),
      depositAmount: rupees(17_500),
      bookingFee: rupees(2_800),
      balanceDue: rupees(52_500),
      cancellationPolicy: [],
    })
    .returning();
  return b;
}

async function expectChat(p: Promise<unknown>, code: ChatError["code"]) {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof ChatError && e.code === code);
}

async function truncate(attempt = 0): Promise<void> {
  try {
    await client`truncate table users, cities, service_categories, auspicious_dates restart identity cascade`;
  } catch (e) {
    // Another test file may be resetting the shared test database right now.
    if (attempt < 10 && /does not exist|deadlock/.test(String(e))) {
      await new Promise((r) => setTimeout(r, 500));
      return truncate(attempt + 1);
    }
    throw e;
  }
}

beforeEach(async () => {
  await truncate();
  sita = await newUser("+9779800000101", "client", "Sita");
  anita = await newUser("+9779800000102", "provider");
  stranger = await newUser("+9779800000103", "client");
  crew = await newUser("+9779800000104", "provider");
  const [studio] = await db
    .insert(s.providerProfiles)
    .values({ userId: anita.id, slug: "anita", displayName: "Anita Studio", kind: "studio", plan: "pro", kycStatus: "verified" })
    .returning();
  studioId = studio.id;
  const [freelancer] = await db
    .insert(s.providerProfiles)
    .values({ userId: crew.id, slug: "crew-1", displayName: "Crew", kind: "freelancer", alias: "Crew T1-001" })
    .returning();
  crewId = freelancer.id;
  threadId = (await openThread(db, sita, { providerId: studioId })).id;
});
afterAll(async () => {
  await client.end();
});

describe("openThread", () => {
  it("returns the same client_business thread for the same pair with the parties in a fixed order", async () => {
    const again = await openThread(db, sita, { providerId: studioId });
    expect(again.id).toBe(threadId);
    expect(again.kind).toBe("client_business");
    expect([again.aUserId, again.bUserId].sort()).toEqual([sita.id, anita.id].sort());
    expect(again.aUserId < again.bUserId).toBe(true);
    expect(await db.select().from(s.chatThreads)).toHaveLength(1);
  });

  it("keys client threads by day and leaves crew threads without one", async () => {
    const dated = await openThread(db, sita, { providerId: studioId, day: "2027-02-24" });
    expect(dated.id).not.toBe(threadId);
    expect(dated.day).toBe("2027-02-24");
    expect((await openThread(db, sita, { providerId: studioId, day: "2027-02-24" })).id).toBe(dated.id);

    const hire = await openThread(db, anita, { providerId: crewId, day: "2027-02-24" });
    expect(hire.kind).toBe("business_crew");
    expect(hire.day).toBeNull();
    expect([hire.aUserId, hire.bUserId].sort()).toEqual([anita.id, crew.id].sort());
  });

  it("refuses a thread with yourself, a client contacting crew and an unknown provider", async () => {
    await expectChat(openThread(db, anita, { providerId: studioId }), "forbidden");
    await expectChat(openThread(db, sita, { providerId: crewId }), "forbidden");
    await expectChat(openThread(db, sita, { providerId: "00000000-0000-0000-0000-000000000000" }), "not_found");
  });
});

describe("sendMessage", () => {
  it("delivers a clean message and stamps the thread", async () => {
    const m = await sendMessage(db, sita, threadId, "Is Falgun 12 free? Budget around Rs 70000.", NOW);
    expect(m.status).toBe("delivered");
    expect(m.senderId).toBe(sita.id);
    expect(m.heldLayer).toBeNull();
    const [t] = await db.select().from(s.chatThreads).where(eq(s.chatThreads.id, threadId));
    expect(t.lastMessageAt).toEqual(NOW);
  });

  it("refuses non-participants and bad bodies", async () => {
    await expectChat(sendMessage(db, stranger, threadId, "hello", NOW), "forbidden");
    await expectChat(sendMessage(db, sita, "00000000-0000-0000-0000-000000000000", "hello", NOW), "not_found");
    await expectChat(sendMessage(db, sita, threadId, "   ", NOW), "bad_input");
    await expectChat(sendMessage(db, sita, threadId, "x".repeat(2001), NOW), "bad_input");
    expect(await db.select().from(s.messages)).toHaveLength(0);
  });

  it("refuses while the sender's chat is paused and lets them write again afterwards", async () => {
    await db.update(s.users).set({ chatPausedUntil: minutesLater(60) }).where(eq(s.users.id, sita.id));
    await expectChat(sendMessage(db, sita, threadId, "hello", NOW), "paused");
    expect(await db.select().from(s.messages)).toHaveLength(0);
    const m = await sendMessage(db, sita, threadId, "hello", minutesLater(61));
    expect(m.status).toBe("delivered");
  });

  it("holds a phone number with the layer and reason, and keeps the thread unstamped", async () => {
    const m = await sendMessage(db, anita, threadId, PHONE, NOW);
    expect(m.status).toBe("held");
    expect(m.heldLayer).toBe(2);
    expect(m.reason).toMatch(/Phone numbers/);
    const [t] = await db.select().from(s.chatThreads).where(eq(s.chatThreads.id, threadId));
    expect(t.lastMessageAt).toBeNull();
  });

  it("catches a number split across messages using the thread as context", async () => {
    expect((await sendMessage(db, anita, threadId, "my number is 98412", NOW)).status).toBe("delivered");
    const second = await sendMessage(db, anita, threadId, "34567", minutesLater(1));
    expect(second.status).toBe("held");
    expect(second.heldLayer).toBe(3);
  });

  it("pauses chat and freezes points at the third hold in 30 days, with an audit row", async () => {
    // One outside the window must not count.
    await db.insert(s.messages).values({ threadId, senderId: anita.id, body: "old", status: "held", createdAt: new Date(NOW.getTime() - 31 * DAY) });
    await sendMessage(db, anita, threadId, PHONE, NOW);
    await sendMessage(db, anita, threadId, PHONE, minutesLater(1));
    let [u] = await db.select().from(s.users).where(eq(s.users.id, anita.id));
    expect(u.chatPausedUntil).toBeNull();
    expect(await db.select().from(s.auditLog)).toHaveLength(0);

    const third = await sendMessage(db, anita, threadId, PHONE, minutesLater(2));
    expect(third.status).toBe("held");
    [u] = await db.select().from(s.users).where(eq(s.users.id, anita.id));
    const until = new Date(minutesLater(2).getTime() + PAUSE_HOURS * 3_600_000);
    expect(u.chatPausedUntil).toEqual(until);
    expect(u.pointsFrozenUntil).toEqual(until);

    const logs = await db.select().from(s.auditLog).where(eq(s.auditLog.action, "chat.paused"));
    expect(logs).toHaveLength(1);
    expect(logs[0].actorId).toBe(anita.id);
    expect(logs[0].subjectType).toBe("user");
    expect(logs[0].subjectId).toBe(anita.id);
    expect(logs[0].detail).toMatchObject({ messageId: third.id, threadId, heldCount: 3 });

    await expectChat(sendMessage(db, anita, threadId, "fine, here then", minutesLater(3)), "paused");
    // The other side is untouched.
    expect((await sendMessage(db, sita, threadId, "ok", minutesLater(3))).status).toBe("delivered");
  });
});

describe("listThread", () => {
  it("shows held messages to the sender only and cleared ones to both", async () => {
    await sendMessage(db, sita, threadId, "hello", NOW);
    const held = await sendMessage(db, anita, threadId, PHONE, minutesLater(1));
    const cleared = await sendMessage(db, anita, threadId, "whatsapp me", minutesLater(2));
    expect(cleared.status).toBe("held");
    await db.update(s.messages).set({ status: "cleared", reviewOutcome: "cleared" }).where(eq(s.messages.id, cleared.id));
    await sendMessage(db, anita, threadId, "sorry, here is fine", minutesLater(3));

    const forSita = await listThread(db, sita, threadId);
    expect(forSita.map((m) => m.body)).toEqual(["hello", "whatsapp me", "sorry, here is fine"]);
    expect(forSita.map((m) => m.id)).not.toContain(held.id);

    const forAnita = await listThread(db, anita, threadId);
    expect(forAnita.map((m) => m.body)).toEqual(["hello", PHONE, "whatsapp me", "sorry, here is fine"]);
    expect(forAnita.find((m) => m.id === held.id)?.status).toBe("held");

    await expectChat(listThread(db, stranger, threadId), "forbidden");
  });
});

describe("appeal", () => {
  it("stamps the sender's own held message and nothing else", async () => {
    const held = await sendMessage(db, anita, threadId, PHONE, NOW);
    const delivered = await sendMessage(db, anita, threadId, "hello", minutesLater(1));

    await expectChat(appeal(db, sita, held.id, minutesLater(2)), "forbidden");
    await expectChat(appeal(db, anita, delivered.id, minutesLater(2)), "wrong_state");
    await expectChat(appeal(db, anita, "00000000-0000-0000-0000-000000000000", minutesLater(2)), "not_found");

    const after = await appeal(db, anita, held.id, minutesLater(2));
    expect(after.appealedAt).toEqual(minutesLater(2));
    // A second appeal keeps the first timestamp.
    expect((await appeal(db, anita, held.id, minutesLater(5))).appealedAt).toEqual(minutesLater(2));
  });
});

describe("sendImage", () => {
  it("is locked until a deposit has been paid between the two sides", async () => {
    const store = memoryStore();
    const png = await fixture("plain-photo.png");
    await expectChat(sendImage(db, sita, threadId, { bytes: png, mime: "image/png" }, { store, now: NOW }), "images_locked");
    await booking("held");
    await expectChat(sendImage(db, sita, threadId, { bytes: png, mime: "image/png" }, { store, now: NOW }), "images_locked");
    await booking("confirmed", stranger.id);
    await expectChat(sendImage(db, sita, threadId, { bytes: png, mime: "image/png" }, { store, now: NOW }), "images_locked");
    expect(store.files.size).toBe(0);

    await booking("confirmed");
    const m = await sendImage(db, sita, threadId, { bytes: png, mime: "image/png" }, { store, now: NOW });
    expect(m.status).toBe("delivered");
    expect(m.attachmentKey).toBe("mem-1");
    expect(Buffer.from(store.files.get("mem-1") ?? []).equals(png)).toBe(true);
    const [t] = await db.select().from(s.chatThreads).where(eq(s.chatThreads.id, threadId));
    expect(t.lastMessageAt).toEqual(NOW);
  });

  it("unlocks through the thread's own booking and refuses non-participants", async () => {
    const store = memoryStore();
    const png = await fixture("plain-photo.png");
    const b = await booking("completed");
    const [t] = await db
      .insert(s.chatThreads)
      .values({ kind: "client_business", aUserId: [sita.id, anita.id].sort()[0], bUserId: [sita.id, anita.id].sort()[1], providerId: studioId, bookingId: b.id, day: b.day })
      .returning();
    expect((await sendImage(db, anita, t.id, { bytes: png, mime: "image/png" }, { store, now: NOW })).status).toBe("delivered");
    await expectChat(sendImage(db, stranger, t.id, { bytes: png, mime: "image/png" }, { store, now: NOW }), "forbidden");
  });

  it("holds an image carrying a QR code without storing it, and counts it as a strike", async () => {
    const store = memoryStore();
    await booking("confirmed");
    const m = await sendImage(db, anita, threadId, { bytes: await fixture("qr-whatsapp.png"), mime: "image/png" }, { store, now: NOW });
    expect(m.status).toBe("held");
    expect(m.heldLayer).toBe(3);
    expect(m.reason).toMatch(/payment details/);
    expect(m.attachmentKey).toBeNull();
    expect(store.files.size).toBe(0);
    expect(await listThread(db, sita, threadId)).toEqual([]);
    expect((await listThread(db, anita, threadId)).map((x) => x.id)).toEqual([m.id]);
  });

  it("rejects bytes that are not a scannable image, whatever the label says", async () => {
    const store = memoryStore();
    await booking("confirmed");
    const pdf = new TextEncoder().encode("%PDF-1.4 not an image");
    await expectChat(sendImage(db, sita, threadId, { bytes: pdf, mime: "image/png" }, { store, now: NOW }), "bad_input");
    await expectChat(sendImage(db, sita, threadId, { bytes: new Uint8Array([1, 2, 3]), mime: "image/png" }, { store, now: NOW }), "bad_input");
    expect(await db.select().from(s.messages)).toHaveLength(0);
  });
});
