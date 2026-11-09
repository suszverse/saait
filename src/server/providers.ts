/**
 * Read models for providers, packages and the calendar. Pure functions over a
 * Drizzle database so pages and tests share them. Only verified providers are
 * ever returned to clients (KYC is a gate, system plan section 15), and only
 * subscribed businesses: a freelancer is crew hired by a business and is never
 * listed (docs/proposals/leakage-and-rewards.md section 13).
 */
import { and, asc, eq, gt, inArray, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as s from "./db/schema";
import type { IsoDate } from "@/lib/nepali-date";

export type Db = PostgresJsDatabase<typeof s>;

/**
 * Booking statuses that occupy a slot. A `held` booking is deliberately not
 * here: its slot is counted through its live date hold, so it is counted
 * once, and it frees itself when the hold expires.
 */
export const OCCUPYING_BOOKING = ["confirmed", "in_progress", "delivered", "completed", "disputed"] as const;

/** Plans that buy a client-facing listing. `free` is for crew only. */
export const LISTED_PLANS = ["pro", "studio"] as const;

type Visibility = Pick<typeof s.providerProfiles.$inferSelect, "kind" | "plan" | "kycStatus">;

/** Can a client see and book this provider: a verified studio on a paid plan. */
export function isClientVisible(p: Visibility): boolean {
  return p.kycStatus === "verified" && p.kind === "studio" && (LISTED_PLANS as readonly string[]).includes(p.plan);
}

/** The same rule as a where-clause, for every query that feeds a client page. */
export function clientVisible() {
  return and(eq(s.providerProfiles.kycStatus, "verified"), eq(s.providerProfiles.kind, "studio"), inArray(s.providerProfiles.plan, [...LISTED_PLANS]));
}

export async function isSaait(db: Db, day: IsoDate): Promise<boolean> {
  const r = await db.select({ day: s.auspiciousDates.day }).from(s.auspiciousDates).where(eq(s.auspiciousDates.day, day));
  return r.length > 0;
}

export async function saaitDaysBetween(db: Db, from: IsoDate, to: IsoDate): Promise<Set<IsoDate>> {
  const rows = await db
    .select({ day: s.auspiciousDates.day })
    .from(s.auspiciousDates)
    .where(and(sql`${s.auspiciousDates.day} >= ${from}`, sql`${s.auspiciousDates.day} <= ${to}`));
  return new Set(rows.map((r) => r.day));
}

/**
 * Slots left per provider on a day: capacity (day override or the profile's
 * daily capacity) minus occupying bookings minus live holds. A blocked day
 * has zero.
 */
export async function slotsLeft(db: Db, providerIds: string[], day: IsoDate, now = new Date()): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (providerIds.length === 0) return out;
  const [profiles, days, booked, held] = await Promise.all([
    db.select({ id: s.providerProfiles.id, cap: s.providerProfiles.dailyCapacity }).from(s.providerProfiles).where(inArray(s.providerProfiles.id, providerIds)),
    db.select().from(s.availabilityDays).where(and(inArray(s.availabilityDays.providerId, providerIds), eq(s.availabilityDays.day, day))),
    db
      .select({ id: s.bookings.providerId, n: sql<number>`count(*)::int` })
      .from(s.bookings)
      .where(and(inArray(s.bookings.providerId, providerIds), eq(s.bookings.day, day), inArray(s.bookings.status, [...OCCUPYING_BOOKING])))
      .groupBy(s.bookings.providerId),
    db
      .select({ id: s.dateHolds.providerId, n: sql<number>`count(*)::int` })
      .from(s.dateHolds)
      .where(and(inArray(s.dateHolds.providerId, providerIds), eq(s.dateHolds.day, day), eq(s.dateHolds.status, "active"), gt(s.dateHolds.expiresAt, now)))
      .groupBy(s.dateHolds.providerId),
  ]);
  const dayBy = new Map(days.map((d) => [d.providerId, d]));
  const bookedBy = new Map(booked.map((b) => [b.id, b.n]));
  const heldBy = new Map(held.map((h) => [h.id, h.n]));
  for (const p of profiles) {
    const d = dayBy.get(p.id);
    const capacity = d?.status === "blocked" ? 0 : (d?.capacity ?? p.cap);
    out.set(p.id, Math.max(0, capacity - (bookedBy.get(p.id) ?? 0) - (heldBy.get(p.id) ?? 0)));
  }
  return out;
}

export type ProviderDetail = Awaited<ReturnType<typeof getVerifiedProvider>>;

export async function getVerifiedProvider(db: Db, slug: string) {
  const [p] = await db
    .select({ profile: s.providerProfiles, city: s.cities })
    .from(s.providerProfiles)
    .leftJoin(s.cities, eq(s.cities.id, s.providerProfiles.homeCityId))
    .where(and(eq(s.providerProfiles.slug, slug), clientVisible()));
  if (!p) return null;
  const pkgs = await db
    .select({ pkg: s.packages, category: s.serviceCategories })
    .from(s.packages)
    .innerJoin(s.serviceCategories, eq(s.serviceCategories.id, s.packages.categoryId))
    .where(and(eq(s.packages.providerId, p.profile.id), eq(s.packages.active, true)))
    .orderBy(asc(s.serviceCategories.sortOrder), asc(s.packages.position));
  const addons = pkgs.length
    ? await db.select().from(s.packageAddons).where(inArray(s.packageAddons.packageId, pkgs.map((x) => x.pkg.id)))
    : [];
  return {
    ...p.profile,
    city: p.city,
    packages: pkgs.map(({ pkg, category }) => ({ ...pkg, category, addons: addons.filter((a) => a.packageId === pkg.id) })),
  };
}

export async function getCategories(db: Db) {
  return db.select().from(s.serviceCategories).where(eq(s.serviceCategories.active, true)).orderBy(asc(s.serviceCategories.sortOrder));
}

export async function getCities(db: Db) {
  return db.select().from(s.cities).orderBy(asc(s.cities.name));
}
