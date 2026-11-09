/**
 * Contact reveal: system plan section 5, "After the lock". The two sides of a
 * booking reach each other through Saait until 48 hours before the event, when
 * each side's phone number is shown to the other. The first time a viewer sees
 * the number a contact_reveals row records it, so a dispute can show who saw
 * what and when.
 *
 * Bookings carry a calendar day and no start time, so the event is taken to
 * start at 00:00 Nepal time (UTC+05:45) on that day. Add a start-time column
 * and change `eventStart` if that ever becomes too coarse.
 */
import { eq } from "drizzle-orm";
import { BookingError } from "./bookings";
import * as s from "./db/schema";
import type { Db } from "./providers";

export const REVEAL_HOURS_BEFORE = 48;

/** Statuses in which the booking is live and the two sides may be put in touch. */
const REVEALABLE = new Set<(typeof s.bookingStatusEnum.enumValues)[number]>(["confirmed", "in_progress", "delivered", "completed"]);

export type Contact =
  | { kind: "revealed"; phone: string; name: string }
  | { kind: "pending"; revealAt: Date }
  | { kind: "none" };

type BookingRow = Pick<typeof s.bookings.$inferSelect, "id" | "clientId" | "providerId" | "status" | "day">;

/** Midnight at the start of `day` in Nepal, as an instant. */
export function eventStart(day: string): Date {
  return new Date(`${day}T00:00:00+05:45`);
}

export function revealAt(day: string): Date {
  return new Date(eventStart(day).getTime() - REVEAL_HOURS_BEFORE * 3_600_000);
}

/**
 * The other side's phone and name for `viewer`, who must be the booking's
 * client or the provider's user. Writes the contact_reveals row on first view.
 */
export async function contactFor(db: Db, booking: BookingRow, viewer: { id: string }, now: Date = new Date()): Promise<Contact> {
  const [provider] = await db
    .select({ userId: s.providerProfiles.userId, displayName: s.providerProfiles.displayName })
    .from(s.providerProfiles)
    .where(eq(s.providerProfiles.id, booking.providerId));
  if (!provider) throw new BookingError("not_found", "That booking could not be found.");

  const isClient = viewer.id === booking.clientId;
  const isProvider = viewer.id === provider.userId;
  if (!isClient && !isProvider) throw new BookingError("forbidden", "This booking is not yours.");

  if (!REVEALABLE.has(booking.status)) return { kind: "none" };
  const at = revealAt(booking.day);
  if (now < at) return { kind: "pending", revealAt: at };

  const otherId = isClient ? provider.userId : booking.clientId;
  const [other] = await db.select({ phone: s.users.phone, name: s.users.name }).from(s.users).where(eq(s.users.id, otherId));
  if (!other) throw new BookingError("not_found", "That booking could not be found.");

  await db
    .insert(s.contactReveals)
    .values({ bookingId: booking.id, viewerId: viewer.id, revealedAt: now })
    .onConflictDoNothing({ target: [s.contactReveals.bookingId, s.contactReveals.viewerId] });

  // The client sees the provider as the profile names them; the provider sees the client's own name.
  const name = isClient ? provider.displayName : (other.name ?? "Your client");
  return { kind: "revealed", phone: other.phone, name };
}
