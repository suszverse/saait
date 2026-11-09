import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { fromBs } from "@/lib/nepali-date";
import { rupees } from "@/lib/money";
import * as s from "./db/schema";
import { seed } from "./db/seed";
import { BookingError, checkout, confirmPayment, expireHolds, retryPendingConfirmations, type BookingDeps } from "./bookings";
import { sign } from "./payments";
import { manualGateway } from "./payments/manual";
import { slotsLeft } from "./providers";
import type { SmsSender } from "./sms";

const client = postgres(process.env.DATABASE_URL_TEST ?? "", { max: 5, onnotice: () => {} });
const db = drizzle(client, { schema: s, casing: "snake_case" });
const SECRET = "w".repeat(32);
const FALGUN_12 = fromBs({ year: 2083, month: 11, day: 12 });
const NOW = new Date("2026-11-08T06:00:00Z");
const sent: { to: string; body: string }[] = [];
const sms: SmsSender = { name: "test", send: async (to, body) => void sent.push({ to, body }) };
const deps: BookingDeps = { db, sms, gateway: manualGateway(SECRET), now: () => NOW };

let clients: { id: string; phone: string }[] = [];
let standardId = "";
let droneId = "";
let anitaPkg = "";

beforeAll(async () => {
  await client`truncate table users, cities, service_categories, auspicious_dates restart identity cascade`;
  await seed(db);
  const [shrestha] = await db.select().from(s.providerProfiles).where(eq(s.providerProfiles.slug, "shrestha-studio"));
  const pkgs = await db.select().from(s.packages).where(eq(s.packages.providerId, shrestha.id));
  standardId = pkgs.find((p) => p.name === "Standard")!.id;
  droneId = (await db.select().from(s.packageAddons).where(eq(s.packageAddons.packageId, standardId))).find((a) => a.name === "Drone coverage")!.id;
  const [anita] = await db.select().from(s.providerProfiles).where(eq(s.providerProfiles.slug, "anita-gurung-photography"));
  anitaPkg = (await db.select().from(s.packages).where(eq(s.packages.providerId, anita.id)))[0].id;
});

beforeEach(async () => {
  await client`truncate table sms_outbox, payments, bookings, date_holds restart identity cascade`;
  await client`delete from users where phone like '+97798000077%'`;
  clients = [];
  for (let i = 0; i < 5; i++) {
    const [u] = await db.insert(s.users).values({ phone: `+97798000077${i}0` }).returning();
    clients.push({ id: u.id, phone: u.phone });
  }
  sent.length = 0;
});
afterAll(async () => {
  await client.end();
});

const input = (over: Record<string, unknown> = {}) => ({
  providerSlug: "shrestha-studio",
  packageId: standardId,
  date: FALGUN_12,
  venue: "Siddhartha Party Palace, Butwal",
  method: "esewa",
  ...over,
});

async function pay(code: string, status: "succeeded" | "failed" = "succeeded", amountOverride?: number) {
  const [row] = await db.select({ pay: s.payments }).from(s.payments).innerJoin(s.bookings, eq(s.bookings.id, s.payments.bookingId)).where(eq(s.bookings.code, code));
  const body = JSON.stringify({ gatewayRef: row.pay.gatewayRef, amount: amountOverride ?? row.pay.amount, status });
  const v = deps.gateway.verifyWebhook(body, sign(SECRET, body));
  return v ? confirmPayment(deps, v.gatewayRef, v.amount, v.status) : null;
}

describe("checkout", () => {
  it("prices the Lock the date screen exactly and holds the date", async () => {
    const { booking, redirectTo } = await checkout(deps, clients[0], input());
    expect(booking.status).toBe("held");
    expect(booking.agreedTotal).toBe(rupees(73_000));
    expect(booking.depositAmount).toBe(rupees(18_250));
    expect(booking.bookingFee).toBe(rupees(2_920));
    expect(booking.balanceDue).toBe(rupees(54_750));
    expect(booking.urgency).toBe("standard");
    expect(redirectTo).toBe(`/bookings/${booking.code}/pay`);
    const [p] = await db.select().from(s.payments);
    expect(p.amount).toBe(rupees(21_170));
  });

  it("adds add-ons and refuses add-ons from another package", async () => {
    const { booking } = await checkout(deps, clients[0], input({ addonIds: [droneId] }));
    expect(booking.agreedTotal).toBe(rupees(85_000));
    expect(booking.bookingFee).toBe(rupees(3_000));
    await expect(checkout(deps, clients[1], input({ packageId: anitaPkg, providerSlug: "anita-gurung-photography", addonIds: [droneId] }))).rejects.toBeInstanceOf(BookingError);
  });

  it("counts a held booking once against capacity", async () => {
    const [shrestha] = await db.select().from(s.providerProfiles).where(eq(s.providerProfiles.slug, "shrestha-studio"));
    await checkout(deps, clients[0], input());
    expect((await slotsLeft(db, [shrestha.id], FALGUN_12, NOW)).get(shrestha.id)).toBe(2);
  });

  it("never sells more slots than capacity, even under a burst", async () => {
    const results = await Promise.allSettled(clients.map((c) => checkout(deps, c, input())));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(rejected.every((r) => r.reason instanceof BookingError && r.reason.code === "date_taken")).toBe(true);
  });

  it("refuses unverified providers, past dates and bad input", async () => {
    const [kiran] = await db.select().from(s.providerProfiles).where(eq(s.providerProfiles.slug, "kiran-rai"));
    const [kp] = await db.select().from(s.packages).where(eq(s.packages.providerId, kiran.id));
    await expect(checkout(deps, clients[0], input({ providerSlug: "kiran-rai", packageId: kp.id }))).rejects.toMatchObject({ code: "not_bookable" });
    await expect(checkout(deps, clients[0], input({ date: "2026-11-01" }))).rejects.toMatchObject({ code: "past_date" });
    await expect(checkout(deps, clients[0], input({ venue: "x" }))).rejects.toThrow("Enter the venue");
    await expect(checkout(deps, clients[0], input({ method: "cash" }))).rejects.toThrow();
  });

  it("refuses crew and unsubscribed studios, even when verified", async () => {
    for (const slug of ["golden-hour-nepal", "siddhartha-photo"]) {
      const [p] = await db.select().from(s.providerProfiles).where(eq(s.providerProfiles.slug, slug));
      expect(p.kycStatus).toBe("verified");
      const [pkg] = await db.select().from(s.packages).where(eq(s.packages.providerId, p.id));
      await expect(checkout(deps, clients[0], input({ providerSlug: slug, packageId: pkg.id }))).rejects.toMatchObject({ code: "not_bookable", message: "This provider cannot be booked directly." });
    }
  });

  it("refuses dates more than two years ahead", async () => {
    await expect(checkout(deps, clients[0], input({ date: "2099-06-01" }))).rejects.toThrow("two years ahead");
    await expect(checkout(deps, clients[0], input({ date: "9999-12-31" }))).rejects.toThrow();
  });

  it("flags a booking inside 72 hours as urgent", async () => {
    const { booking } = await checkout(deps, clients[0], input({ date: "2026-11-09" }));
    expect(booking.urgency).toBe("urgent");
  });
});

describe("confirmation SMS outbox", () => {
  it("survives an SMS failure and is retried on redelivery or by the tick", async () => {
    const flaky: SmsSender = { name: "flaky", send: async () => { throw new Error("gateway down"); } };
    const { booking } = await checkout(deps, clients[0], input());
    const [p] = await db.select().from(s.payments);
    expect((await confirmPayment({ ...deps, sms: flaky }, p.gatewayRef, p.amount, "succeeded")).ok).toBe(true);
    const [b] = await db.select().from(s.bookings).where(eq(s.bookings.id, booking.id));
    expect(b.status).toBe("confirmed");
    expect((await db.select().from(s.smsOutbox)).every((r) => r.status === "pending")).toBe(true);
    expect(await confirmPayment(deps, p.gatewayRef, p.amount, "succeeded")).toMatchObject({ ok: true, already: true });
    expect(sent).toHaveLength(2);
    expect(await retryPendingConfirmations(deps)).toBe(0);
  });

  it("sends each text once under concurrent deliveries and a slow gateway", async () => {
    const slow: SmsSender = { name: "slow", send: async (to, body) => { await new Promise((r) => setTimeout(r, 150)); sent.push({ to, body }); } };
    await checkout(deps, clients[0], input());
    const [p] = await db.select().from(s.payments);
    const d = { ...deps, sms: slow };
    await Promise.all([
      ...Array.from({ length: 5 }, () => confirmPayment(d, p.gatewayRef, p.amount, "succeeded")),
      retryPendingConfirmations(d),
      retryPendingConfirmations(d),
    ]);
    expect(sent).toHaveLength(2);
    expect(new Set(sent.map((x) => x.to)).size).toBe(2);
  });

  it("resends only the text that failed", async () => {
    let calls = 0;
    const half: SmsSender = { name: "half", send: async (to, body) => { calls++; if (calls === 2) throw new Error("down"); sent.push({ to, body }); } };
    await checkout(deps, clients[0], input());
    const [p] = await db.select().from(s.payments);
    await confirmPayment({ ...deps, sms: half }, p.gatewayRef, p.amount, "succeeded");
    expect(sent).toHaveLength(1);
    await retryPendingConfirmations(deps);
    expect(sent).toHaveLength(2);
    expect(sent[0].to).not.toBe(sent[1].to);
  });
});

describe("payment confirmation", () => {
  it("confirms once, converts the hold and texts both sides", async () => {
    const { booking } = await checkout(deps, clients[0], input());
    expect((await pay(booking.code))?.ok).toBe(true);
    const again = await pay(booking.code);
    expect(again).toMatchObject({ ok: true, already: true });
    const [b] = await db.select().from(s.bookings).where(eq(s.bookings.id, booking.id));
    expect(b.status).toBe("confirmed");
    const [h] = await db.select().from(s.dateHolds);
    expect(h.status).toBe("converted");
    expect(sent).toHaveLength(2);
    expect(sent[0].body).toBe(`Saait: Falgun 12 (Feb 24) is locked with Shrestha Studio. Deposit Rs 18,250 received. Balance Rs 54,750 is paid to the studio after the event. Code ${booking.code}.`);
  });

  it("rejects a forged signature, a wrong amount and a failed payment", async () => {
    const { booking } = await checkout(deps, clients[0], input());
    const [p] = await db.select().from(s.payments);
    const body = JSON.stringify({ gatewayRef: p.gatewayRef, amount: p.amount, status: "succeeded" });
    expect(deps.gateway.verifyWebhook(body, "0".repeat(64))).toBeNull();
    expect(deps.gateway.verifyWebhook(body, null)).toBeNull();
    expect(await pay(booking.code, "succeeded", p.amount - 100)).toMatchObject({ ok: false, reason: "amount_mismatch" });
    expect(await pay(booking.code, "failed")).toMatchObject({ ok: false, reason: "failed" });
  });

  it("will not confirm after the hold expired, and frees the slot", async () => {
    const { booking } = await checkout(deps, clients[0], input());
    const later = new Date(NOW.getTime() + 25 * 3_600_000);
    expect(await expireHolds(db, later)).toBe(1);
    const late = await confirmPayment({ ...deps, now: () => later }, (await db.select().from(s.payments))[0].gatewayRef, rupees(21_170), "succeeded");
    expect(late).toMatchObject({ ok: false, reason: "hold_expired" });
    const [b] = await db.select().from(s.bookings).where(eq(s.bookings.id, booking.id));
    expect(b.status).toBe("cancelled");
  });
});
