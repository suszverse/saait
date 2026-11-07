/**
 * Holding and locking a date: system plan section 5, "Client books a date".
 *
 * 1. Checkout places a 24-hour hold and a booking in status `held`, inside a
 *    per-provider-per-day advisory lock so two clients cannot take the last
 *    slot at the same moment.
 * 2. Only the deposit plus the booking fee is charged through the platform;
 *    the balance is paid client to provider directly.
 * 3. A verified payment confirms the booking exactly once, converts the
 *    hold, and sends SMS to both sides.
 */
import { randomInt } from "node:crypto";
import { and, eq, inArray, lte, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { z } from "zod";
import * as s from "./db/schema";
import { slotsLeft } from "./providers";
import type { SmsSender } from "./sms";
import type { PaymentGateway, PaymentMethod } from "./payments";
import { PAYMENT_METHODS } from "./payments";
import { DEFAULT_CANCELLATION_POLICY, quote, vatInsideFee } from "@/lib/fees";
import { formatRs, paisa } from "@/lib/money";
import { bsDayMonth, daysBetween, gregorianShort, isIsoDate, todayInNepal, type IsoDate } from "@/lib/nepali-date";

type Db = PostgresJsDatabase<typeof s>;
export type BookingDeps = { db: Db; sms: SmsSender; gateway: PaymentGateway; now?: () => Date };

export const HOLD_HOURS = 24;
/** Bookings open up to two years ahead, well inside the BS calendar tables. */
export const MAX_DAYS_AHEAD = 730;
export const URGENT_WINDOW_DAYS = 3; // inside 72 hours

export class BookingError extends Error {
  constructor(
    public readonly code: "not_found" | "not_bookable" | "date_taken" | "past_date" | "bad_addon" | "wrong_state" | "forbidden",
    message: string,
  ) {
    super(message);
  }
}

export const checkoutInput = z.object({
  providerSlug: z.string().regex(/^[a-z0-9-]{1,80}$/),
  packageId: z.string().uuid(),
  date: z
    .string()
    .refine(isIsoDate, "Pick a date.")
    .refine((d) => isIsoDate(d) && daysBetween(todayInNepal(), d as IsoDate) <= MAX_DAYS_AHEAD, "Bookings open up to two years ahead. Pick an earlier date."),
  venue: z.string().trim().min(3, "Enter the venue name and town.").max(200, "Keep the venue under 200 characters."),
  addonIds: z.array(z.string().uuid()).max(10).default([]),
  method: z.enum(PAYMENT_METHODS),
});
export type CheckoutInput = z.infer<typeof checkoutInput>;

async function newCode(db: Db): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const code = `SA-${randomInt(1000, 10000)}`;
    const [hit] = await db.select({ id: s.bookings.id }).from(s.bookings).where(eq(s.bookings.code, code));
    if (!hit) return code;
  }
  return `SA-${randomInt(10000, 100000)}`;
}

/** Everything the Lock the date screen shows, computed on the server. */
export async function priceCheckout(db: Db, input: { providerSlug: string; packageId: string; date: IsoDate; addonIds: string[] }) {
  const [row] = await db
    .select({ p: s.providerProfiles, pkg: s.packages })
    .from(s.packages)
    .innerJoin(s.providerProfiles, eq(s.providerProfiles.id, s.packages.providerId))
    .where(and(eq(s.packages.id, input.packageId), eq(s.providerProfiles.slug, input.providerSlug), eq(s.packages.active, true)));
  if (!row) throw new BookingError("not_found", "That package is not available.");
  if (row.p.kycStatus !== "verified") throw new BookingError("not_bookable", "This provider cannot take bookings right now.");
  const addons = await db.select().from(s.packageAddons).where(eq(s.packageAddons.packageId, row.pkg.id));
  const chosen = addons.filter((a) => input.addonIds.includes(a.id));
  if (chosen.length !== new Set(input.addonIds).size) throw new BookingError("bad_addon", "One of those add-ons is not on this package.");
  const [saaitRow] = await db.select().from(s.auspiciousDates).where(eq(s.auspiciousDates.day, input.date));
  const q = quote({
    packagePrice: paisa(row.pkg.price),
    peakSurcharge: paisa(saaitRow ? row.pkg.peakSurcharge : 0),
    addons: chosen.map((a) => paisa(a.price)),
    depositPercent: row.pkg.depositPercent,
  });
  return { provider: row.p, pkg: row.pkg, addons, chosen, saait: !!saaitRow, quote: q };
}

export async function checkout(deps: BookingDeps, client: { id: string; phone: string }, raw: unknown) {
  const input = checkoutInput.parse(raw);
  const now = deps.now?.() ?? new Date();
  const today = todayInNepal(now);
  if (input.date < today) throw new BookingError("past_date", "That date has passed. Pick another.");
  const priced = await priceCheckout(deps.db, { ...input, date: input.date as IsoDate });
  const { provider, pkg, chosen, quote: q } = priced;
  const urgency = daysBetween(today, input.date as IsoDate) < URGENT_WINDOW_DAYS ? "urgent" : "standard";

  const result = await deps.db.transaction(async (tx) => {
    // Serialise checkouts for this provider and day; released at commit.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${provider.id}:${input.date}`}))`);
    const left = (await slotsLeft(tx as unknown as Db, [provider.id], input.date as IsoDate, now)).get(provider.id) ?? 0;
    if (left <= 0) throw new BookingError("date_taken", `${provider.displayName} is no longer free on ${bsDayMonth(input.date)}. Pick another date or provider.`);
    const [hold] = await tx
      .insert(s.dateHolds)
      .values({ providerId: provider.id, packageId: pkg.id, clientId: client.id, day: input.date, expiresAt: new Date(now.getTime() + HOLD_HOURS * 3_600_000) })
      .returning();
    const code = await newCode(tx as unknown as Db);
    const [booking] = await tx
      .insert(s.bookings)
      .values({
        code,
        clientId: client.id,
        providerId: provider.id,
        packageId: pkg.id,
        holdId: hold.id,
        day: input.date,
        urgency,
        status: "held",
        venue: input.venue,
        contactPhone: client.phone,
        packageName: pkg.name,
        packagePrice: q.packagePrice,
        peakSurcharge: q.peakSurcharge,
        addonsTotal: q.addons,
        addons: chosen.map((a) => ({ id: a.id, name: a.name, price: a.price })),
        agreedTotal: q.agreedTotal,
        depositAmount: q.deposit,
        bookingFee: q.bookingFee,
        bookingFeeVat: vatInsideFee(q.bookingFee).vat,
        urgentSurcharge: q.urgentSurcharge,
        balanceDue: q.balance,
        cancellationPolicy: [...DEFAULT_CANCELLATION_POLICY],
      })
      .returning();
    const [payment] = await tx
      .insert(s.payments)
      .values({ bookingId: booking.id, gateway: deps.gateway.name, method: input.method, gatewayRef: `pending-${booking.id}`, amount: q.payNow })
      .returning();
    return { booking, payment };
  });

  const started = await deps.gateway.start({
    paymentId: result.payment.id,
    bookingCode: result.booking.code,
    amount: result.payment.amount,
    method: input.method as PaymentMethod,
  });
  await deps.db.update(s.payments).set({ gatewayRef: started.gatewayRef }).where(eq(s.payments.id, result.payment.id));
  return { booking: result.booking, redirectTo: started.redirectTo };
}

/**
 * Idempotent: a webhook delivered twice confirms once. An amount that does
 * not match the payment row is refused, as is a payment for a booking whose
 * hold has expired.
 */
export async function confirmPayment(deps: BookingDeps, gatewayRef: string, amount: number, status: "succeeded" | "failed") {
  const now = deps.now?.() ?? new Date();
  const out = await deps.db.transaction(async (tx) => {
    const [pay] = await tx
      .select()
      .from(s.payments)
      .where(and(eq(s.payments.gateway, deps.gateway.name), eq(s.payments.gatewayRef, gatewayRef)))
      .for("update");
    if (!pay) return { ok: false as const, reason: "unknown_payment" };
    if (pay.status === "succeeded") return { ok: true as const, already: true, bookingId: pay.bookingId };
    if (pay.amount !== amount) return { ok: false as const, reason: "amount_mismatch" };
    if (status === "failed") {
      await tx.update(s.payments).set({ status: "failed" }).where(eq(s.payments.id, pay.id));
      return { ok: false as const, reason: "failed" };
    }
    const [b] = await tx.select().from(s.bookings).where(eq(s.bookings.id, pay.bookingId)).for("update");
    const [hold] = b.holdId ? await tx.select().from(s.dateHolds).where(eq(s.dateHolds.id, b.holdId)) : [];
    if (b.status !== "held" || !hold || hold.status !== "active" || hold.expiresAt <= now) {
      return { ok: false as const, reason: "hold_expired" };
    }
    await tx.update(s.payments).set({ status: "succeeded", settledAt: now }).where(eq(s.payments.id, pay.id));
    await tx.update(s.bookings).set({ status: "confirmed", confirmedAt: now }).where(eq(s.bookings.id, b.id));
    await tx.update(s.dateHolds).set({ status: "converted" }).where(eq(s.dateHolds.id, hold.id));
    const texts = await confirmationTexts(tx as unknown as Db, b.id);
    await tx.insert(s.smsOutbox).values(texts.map((t) => ({ bookingId: b.id, purpose: "booking_confirmed", ...t }))).onConflictDoNothing();
    return { ok: true as const, already: false, bookingId: b.id };
  });
  // The texts were queued inside the transaction; deliver them now. A
  // redelivery delivers anything still pending, so nothing is lost.
  if (out.ok) await deliverOutbox(deps, { bookingId: out.bookingId });
  return out;
}

/** Stale claims (a worker died mid-send) become claimable again after this. */
export const OUTBOX_CLAIM_TIMEOUT_MS = 10 * 60_000;

/**
 * Claims each pending text atomically before sending it. Concurrent callers
 * (webhook redeliveries, the jobs tick) each get different rows or none, so a
 * text goes out once. A failed send goes back to pending for the next try.
 */
export async function deliverOutbox(deps: BookingDeps, scope: { bookingId?: string } = {}) {
  const now = deps.now?.() ?? new Date();
  const stale = new Date(now.getTime() - OUTBOX_CLAIM_TIMEOUT_MS);
  const candidates = await deps.db
    .select({ id: s.smsOutbox.id })
    .from(s.smsOutbox)
    .where(
      and(
        scope.bookingId ? eq(s.smsOutbox.bookingId, scope.bookingId) : undefined,
        sql`(${s.smsOutbox.status} = 'pending' or (${s.smsOutbox.status} = 'sending' and ${s.smsOutbox.claimedAt} < ${stale.toISOString()}::timestamptz))`,
      ),
    );
  let sent = 0;
  for (const c of candidates) {
    const [claimed] = await deps.db
      .update(s.smsOutbox)
      .set({ status: "sending", claimedAt: now, attempts: sql`${s.smsOutbox.attempts} + 1` })
      .where(
        and(
          eq(s.smsOutbox.id, c.id),
          sql`(${s.smsOutbox.status} = 'pending' or (${s.smsOutbox.status} = 'sending' and ${s.smsOutbox.claimedAt} < ${stale.toISOString()}::timestamptz))`,
        ),
      )
      .returning();
    if (!claimed) continue;
    try {
      await deps.sms.send(claimed.to, claimed.body, claimed.purpose as Parameters<SmsSender["send"]>[2]);
      await deps.db.update(s.smsOutbox).set({ status: "sent", sentAt: deps.now?.() ?? new Date(), lastError: null }).where(eq(s.smsOutbox.id, claimed.id));
      sent++;
    } catch (e) {
      await deps.db
        .update(s.smsOutbox)
        .set({ status: "pending", claimedAt: null, lastError: String(e).slice(0, 500) })
        .where(eq(s.smsOutbox.id, claimed.id));
    }
  }
  return sent;
}

/** Retry anything still pending. Called by the jobs tick. */
export async function retryPendingConfirmations(deps: BookingDeps) {
  return deliverOutbox(deps);
}

/** The hold behind a held booking, and whether it is still live. */
export async function holdState(db: Db, bookingId: string, now = new Date()) {
  const [row] = await db
    .select({ h: s.dateHolds })
    .from(s.bookings)
    .innerJoin(s.dateHolds, eq(s.dateHolds.id, s.bookings.holdId))
    .where(eq(s.bookings.id, bookingId));
  if (!row) return { live: false, expiresAt: null as Date | null };
  return { live: row.h.status === "active" && row.h.expiresAt > now, expiresAt: row.h.expiresAt };
}

/** The two confirmation texts, client and provider, as on the design board. */
async function confirmationTexts(db: Db, bookingId: string) {
  const [row] = await db
    .select({ b: s.bookings, p: s.providerProfiles, pu: s.users })
    .from(s.bookings)
    .innerJoin(s.providerProfiles, eq(s.providerProfiles.id, s.bookings.providerId))
    .innerJoin(s.users, eq(s.users.id, s.providerProfiles.userId))
    .where(eq(s.bookings.id, bookingId));
  const { b, p, pu } = row;
  const when = `${bsDayMonth(b.day)} (${gregorianShort(b.day)})`;
  return [
    {
      to: b.contactPhone,
      body: `Saait: ${when} is locked with ${p.displayName}. Deposit ${formatRs(paisa(b.depositAmount))} received. Balance ${formatRs(paisa(b.balanceDue))} is paid to the ${p.kind === "studio" ? "studio" : "provider"} after the event. Code ${b.code}.`,
    },
    {
      to: pu.phone,
      body: `Saait: new booking ${b.code}. ${b.packageName}, ${when}, ${b.venue}. Deposit ${formatRs(paisa(b.depositAmount))} held for you; balance ${formatRs(paisa(b.balanceDue))} is paid to you directly.`,
    },
  ];
}

/** Expire stale holds so their slots return to the calendar. Safe to run often. */
export async function expireHolds(db: Db, now = new Date()) {
  const expired = await db
    .update(s.dateHolds)
    .set({ status: "expired" })
    .where(and(eq(s.dateHolds.status, "active"), lte(s.dateHolds.expiresAt, now)))
    .returning({ id: s.dateHolds.id });
  if (expired.length) {
    await db
      .update(s.bookings)
      .set({ status: "cancelled", cancelledAt: now })
      .where(and(eq(s.bookings.status, "held"), inArray(s.bookings.holdId, expired.map((h) => h.id))));
  }
  return expired.length;
}

export async function bookingForClient(db: Db, code: string, clientId: string) {
  const [row] = await db
    .select({ b: s.bookings, p: s.providerProfiles, pay: s.payments })
    .from(s.bookings)
    .innerJoin(s.providerProfiles, eq(s.providerProfiles.id, s.bookings.providerId))
    .leftJoin(s.payments, eq(s.payments.bookingId, s.bookings.id))
    .where(and(eq(s.bookings.code, code), eq(s.bookings.clientId, clientId)));
  return row ?? null;
}

export async function bookingsForClient(db: Db, clientId: string) {
  return db
    .select({ b: s.bookings, p: s.providerProfiles })
    .from(s.bookings)
    .innerJoin(s.providerProfiles, eq(s.providerProfiles.id, s.bookings.providerId))
    .where(eq(s.bookings.clientId, clientId))
    .orderBy(s.bookings.day);
}
