import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { rupees } from "@/lib/money";
import { BookingError } from "./bookings";
import { contactFor, revealAt } from "./booking-contact";
import * as s from "./db/schema";

const client = postgres(process.env.DATABASE_URL_TEST ?? "", { max: 1, onnotice: () => {} });
const db = drizzle(client, { schema: s, casing: "snake_case" });

const DAY = "2027-02-24"; // event starts 2027-02-23T18:15:00Z (00:00 Nepal)
const EVENT_START = new Date("2027-02-23T18:15:00Z");
const hoursBefore = (h: number) => new Date(EVENT_START.getTime() - h * 3_600_000);

let clientUser: { id: string; phone: string };
let providerUser: { id: string; phone: string };
let stranger: { id: string };
let providerId = "";
let n = 0;

beforeAll(async () => {
  await client`delete from users where phone like '+97798000088%'`;
  [clientUser] = await db.insert(s.users).values({ phone: "+9779800008810", name: "Sita Rai" }).returning();
  [providerUser] = await db.insert(s.users).values({ phone: "+9779800008820", role: "provider" }).returning();
  [stranger] = await db.insert(s.users).values({ phone: "+9779800008830" }).returning();
  const [p] = await db
    .insert(s.providerProfiles)
    .values({ userId: providerUser.id, slug: "contact-test-studio", displayName: "Contact Test Studio", kind: "studio" })
    .returning();
  providerId = p.id;
});
beforeEach(async () => {
  await client`delete from contact_reveals where booking_id in (select id from bookings where code like 'CT-%')`;
  await client`delete from bookings where code like 'CT-%'`;
});
afterAll(async () => {
  await client`delete from contact_reveals where booking_id in (select id from bookings where code like 'CT-%')`;
  await client`delete from bookings where code like 'CT-%'`;
  await db.delete(s.providerProfiles).where(eq(s.providerProfiles.id, providerId));
  await client`delete from users where phone like '+97798000088%'`;
  await client.end();
});

async function booking(status: "held" | "confirmed" | "cancelled" = "confirmed") {
  const [b] = await db
    .insert(s.bookings)
    .values({
      code: `CT-${++n}`,
      clientId: clientUser.id,
      providerId,
      day: DAY,
      status,
      venue: "Siddhartha Party Palace, Butwal",
      contactPhone: clientUser.phone,
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

describe("contactFor", () => {
  it("places the reveal 48 hours before midnight Nepal time on the event day", () => {
    expect(revealAt(DAY).toISOString()).toBe("2027-02-21T18:15:00.000Z");
  });

  it("is pending 49 hours before the event, with the reveal time", async () => {
    const b = await booking();
    const c = await contactFor(db, b, clientUser, hoursBefore(49));
    expect(c).toEqual({ kind: "pending", revealAt: hoursBefore(48) });
    expect(await db.select().from(s.contactReveals).where(eq(s.contactReveals.bookingId, b.id))).toHaveLength(0);
  });

  it("reveals the other side 47 hours before and records one row per viewer", async () => {
    const b = await booking();
    const now = hoursBefore(47);
    const first = await contactFor(db, b, clientUser, now);
    expect(first).toEqual({ kind: "revealed", phone: providerUser.phone, name: "Contact Test Studio" });
    expect(await contactFor(db, b, clientUser, now)).toEqual(first);
    const rows = await db.select().from(s.contactReveals).where(eq(s.contactReveals.bookingId, b.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].viewerId).toBe(clientUser.id);
    expect(rows[0].revealedAt.getTime()).toBe(now.getTime());

    const fromProvider = await contactFor(db, b, providerUser, now);
    expect(fromProvider).toEqual({ kind: "revealed", phone: clientUser.phone, name: "Sita Rai" });
    expect(await db.select().from(s.contactReveals).where(eq(s.contactReveals.bookingId, b.id))).toHaveLength(2);
  });

  it("shows nothing for a booking that is only held or has been cancelled", async () => {
    expect(await contactFor(db, await booking("held"), clientUser, hoursBefore(1))).toEqual({ kind: "none" });
    expect(await contactFor(db, await booking("cancelled"), clientUser, hoursBefore(1))).toEqual({ kind: "none" });
  });

  it("refuses a viewer who is neither side of the booking", async () => {
    const b = await booking();
    await expect(contactFor(db, b, stranger, hoursBefore(1))).rejects.toBeInstanceOf(BookingError);
    await expect(contactFor(db, b, stranger, hoursBefore(1))).rejects.toMatchObject({ code: "forbidden" });
  });
});
