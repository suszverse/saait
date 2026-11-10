import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { fromBs } from "@/lib/nepali-date";
import { vatInsideFee } from "@/lib/fees";
import { paisa, rupees } from "@/lib/money";
import * as s from "./db/schema";
import { seed } from "./db/seed";
import { BookingError, checkout, confirmBalancePaid, confirmPayment, expireHolds, retryPendingConfirmations, type BookingDeps } from "./bookings";
import { sign } from "./payments";
import { manualGateway } from "./payments/manual";
import { slotsLeft } from "./providers";
import { BOOKING_POINTS } from "./rewards/earn";
import { creditBalance, pointsBalance, post } from "./rewards/ledger";
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
  venueLat: 27.7006,
  venueLng: 83.4483,
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

  it("keeps the venue pin on the booking row", async () => {
    const { booking } = await checkout(deps, clients[0], input({ venueLat: "27.7006", venueLng: "83.4483" }));
    const [b] = await db.select().from(s.bookings).where(eq(s.bookings.id, booking.id));
    expect(b.venueLat).toBe(27.7006);
    expect(b.venueLng).toBe(83.4483);
  });

  it("refuses a venue pin outside Nepal, naming the field", async () => {
    await expect(checkout(deps, clients[0], input({ venueLat: 13.08 }))).rejects.toMatchObject({ issues: [{ path: ["venueLat"], message: "Pick a venue inside Nepal." }] });
    await expect(checkout(deps, clients[0], input({ venueLng: 77.2 }))).rejects.toMatchObject({ issues: [{ path: ["venueLng"] }] });
    await expect(checkout(deps, clients[0], input({ venueLat: undefined }))).rejects.toMatchObject({ issues: [{ path: ["venueLat"] }] });
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

describe("balance confirmed by the client", () => {
  // The day after Falgun 12, so the event has passed in Nepal.
  const AFTER = new Date("2027-02-25T06:00:00Z");

  async function locked(client = clients[0]) {
    const { booking } = await checkout(deps, client, input());
    await pay(booking.code);
    return booking;
  }

  it("completes the booking after the event day, posting the client's credit and the provider's points", async () => {
    const booking = await locked();
    const [before] = await db.select().from(s.providerProfiles).where(eq(s.providerProfiles.id, booking.providerId));
    const r = await confirmBalancePaid({ db, now: () => AFTER }, clients[0].id, booking.code);
    // Fee Rs 2,920, nothing covered by credit: a quarter is Rs 730.
    expect(r).toEqual({ changed: true, completed: true, clientCredit: rupees(730) });
    const [b] = await db.select().from(s.bookings).where(eq(s.bookings.id, booking.id));
    expect(b.status).toBe("completed");
    expect(b.balancePaidClientConfirmedAt).toEqual(AFTER);
    const [after] = await db.select().from(s.providerProfiles).where(eq(s.providerProfiles.id, booking.providerId));
    expect(after.completedBookings).toBe(before.completedBookings + 1);
    expect(await creditBalance(db, clients[0].id, AFTER)).toBe(rupees(730));
    expect(await pointsBalance(db, after.userId)).toBe(BOOKING_POINTS);
  });

  it("does nothing on a second confirm", async () => {
    const booking = await locked();
    await confirmBalancePaid({ db, now: () => AFTER }, clients[0].id, booking.code);
    const [p1] = await db.select().from(s.providerProfiles).where(eq(s.providerProfiles.id, booking.providerId));
    expect(await confirmBalancePaid({ db, now: () => AFTER }, clients[0].id, booking.code)).toEqual({ changed: false });
    const [p2] = await db.select().from(s.providerProfiles).where(eq(s.providerProfiles.id, booking.providerId));
    expect(p2.completedBookings).toBe(p1.completedBookings);
    expect(await creditBalance(db, clients[0].id, AFTER)).toBe(rupees(730));
  });

  it("refuses someone else's booking and a booking that is not locked", async () => {
    const booking = await locked();
    await expect(confirmBalancePaid({ db, now: () => AFTER }, clients[1].id, booking.code)).rejects.toMatchObject({ code: "forbidden" });
    const { booking: held } = await checkout(deps, clients[2], input({ date: fromBs({ year: 2083, month: 11, day: 13 }) }));
    await expect(confirmBalancePaid({ db, now: () => AFTER }, clients[2].id, held.code)).rejects.toMatchObject({ code: "not_confirmable" });
    const [b] = await db.select().from(s.bookings).where(eq(s.bookings.id, booking.id));
    expect(b.status).toBe("confirmed");
    expect(b.balancePaidClientConfirmedAt).toBeNull();
  });

  it("before the event day marks the balance paid but does not complete", async () => {
    const booking = await locked();
    expect(await confirmBalancePaid({ db, now: () => NOW }, clients[0].id, booking.code)).toEqual({ changed: true, completed: false, clientCredit: 0 });
    const [b] = await db.select().from(s.bookings).where(eq(s.bookings.id, booking.id));
    expect(b.status).toBe("confirmed");
    expect(b.balancePaidClientConfirmedAt).toEqual(NOW);
    expect(await creditBalance(db, clients[0].id, NOW)).toBe(0);
    // Once the event day has passed, the next call completes it instead of getting stuck.
    const later = await confirmBalancePaid({ db, now: () => AFTER }, clients[0].id, booking.code);
    expect(later.changed).toBe(true);
    expect(later).toMatchObject({ completed: true });
    const [done] = await db.select().from(s.bookings).where(eq(s.bookings.id, booking.id));
    expect(done.status).toBe("completed");
    expect(done.balancePaidClientConfirmedAt).toEqual(NOW);
    expect(await confirmBalancePaid({ db, now: () => AFTER }, clients[0].id, booking.code)).toEqual({ changed: false });
  });
});

describe("Saait credit at checkout", () => {
  // Falgun 20 onward are not wedding dates: each confirmed Rs 65,000 booking
  // earns a Rs 2,600 fee, so Rs 650 of credit budget.
  async function feeRevenue(bookings: number) {
    for (let i = 0; i < bookings; i++) {
      const { booking } = await checkout(deps, clients[4], input({ date: fromBs({ year: 2083, month: 11, day: 20 + i }) }));
      await pay(booking.code);
    }
  }
  // Granted an hour before checkout: ledger rows written at the same instant replay in id order.
  const grant = (c: { id: string }, amount: number) => post(db, { userId: c.id, kind: "credit", amount, reason: "referral" }, new Date(NOW.getTime() - 3_600_000));
  const spends = (bookingId: string) =>
    db.select().from(s.rewardLedger).where(eq(s.rewardLedger.bookingId, bookingId)).then((rows) => rows.filter((r) => r.reason === "checkout_spend"));

  it("takes credit off the fee, leaves the deposit alone and records VAT on what is paid", async () => {
    await feeRevenue(2);
    await grant(clients[0], rupees(1_000));
    const { booking } = await checkout(deps, clients[0], input());
    expect(booking.depositAmount).toBe(rupees(18_250));
    expect(booking.bookingFee).toBe(rupees(2_920));
    expect(booking.creditApplied).toBe(rupees(1_000));
    expect(booking.bookingFeeVat).toBe(vatInsideFee(paisa(rupees(1_920))).vat);
    const [p] = await db.select().from(s.payments).where(eq(s.payments.bookingId, booking.id));
    expect(p.amount).toBe(rupees(18_250 + 1_920));
    expect((await spends(booking.id)).map((r) => r.amount)).toEqual([-rupees(1_000)]);
    expect(await creditBalance(db, clients[0].id, NOW)).toBe(0);
  });

  it("never applies more credit than the fee", async () => {
    await feeRevenue(5);
    await grant(clients[0], rupees(5_000));
    const { booking } = await checkout(deps, clients[0], input());
    expect(booking.creditApplied).toBe(rupees(2_920));
    expect(booking.bookingFeeVat).toBe(0);
    const [p] = await db.select().from(s.payments).where(eq(s.payments.bookingId, booking.id));
    expect(p.amount).toBe(rupees(18_250));
    expect(await creditBalance(db, clients[0].id, NOW)).toBe(rupees(2_080));
  });

  it("caps applied credit at what is left of the month's budget", async () => {
    await feeRevenue(1);
    await grant(clients[0], rupees(2_000));
    const { booking } = await checkout(deps, clients[0], input());
    expect(booking.creditApplied).toBe(rupees(650));
    const [p] = await db.select().from(s.payments).where(eq(s.payments.bookingId, booking.id));
    expect(p.amount).toBe(rupees(18_250 + 2_270));
    // The budget is now spent, so the next client pays the full fee.
    await grant(clients[1], rupees(500));
    const { booking: next } = await checkout(deps, clients[1], input());
    expect(next.creditApplied).toBe(0);
  });

  it("returns the credit once when the hold expires", async () => {
    await feeRevenue(2);
    await grant(clients[0], rupees(1_000));
    const { booking } = await checkout(deps, clients[0], input());
    const later = new Date(NOW.getTime() + 25 * 3_600_000);
    expect(await expireHolds(db, later)).toBe(1);
    expect(await expireHolds(db, later)).toBe(0);
    expect((await spends(booking.id)).map((r) => r.amount).sort((a, b) => a - b)).toEqual([-rupees(1_000), rupees(1_000)]);
    expect(await creditBalance(db, clients[0].id, later)).toBe(rupees(1_000));
  });

  it("returns the credit once when the payment fails, and the later expiry adds nothing", async () => {
    await feeRevenue(2);
    await grant(clients[0], rupees(1_000));
    const { booking } = await checkout(deps, clients[0], input());
    expect(await pay(booking.code, "failed")).toMatchObject({ ok: false, reason: "failed" });
    expect(await pay(booking.code, "failed")).toMatchObject({ ok: false, reason: "failed" });
    await expireHolds(db, new Date(NOW.getTime() + 25 * 3_600_000));
    expect((await spends(booking.id)).filter((r) => r.amount > 0)).toHaveLength(1);
    expect(await creditBalance(db, clients[0].id, NOW)).toBe(rupees(1_000));
    expect(await pay(booking.code)).toMatchObject({ ok: false, reason: "hold_expired" });
    const [b] = await db.select().from(s.bookings).where(eq(s.bookings.id, booking.id));
    expect(b.status).toBe("cancelled");
  });
});
