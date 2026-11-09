/**
 * Leakage signals for the operator desk (Figma O2). Nothing here decides
 * anything: it surfaces patterns that suggest a deal moved off Saait so an
 * operator can look. The strongest signal is a business blocking a day in
 * its calendar after a client asked about that day in chat, with no booking
 * on Saait to explain the block.
 */
import { and, desc, eq, gte, isNotNull, notExists, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as s from "./db/schema";

type Db = PostgresJsDatabase<typeof s>;

export type CalendarBlockSignal = {
  thread: { id: string; createdAt: Date };
  provider: { id: string; name: string };
  clientUserId: string;
  client: { name: string | null; phone: string };
  day: string;
  /** When the availability row was last written; the block happened at or before this. */
  blockedAt: Date;
  enquiredAt: Date;
};

/**
 * Client to business threads with a day where the business marked that day
 * blocked after the thread opened and no booking exists for that client,
 * business and day. `since` keeps the list to blocks made on or after it.
 */
export async function calendarBlocksAfterEnquiry(db: Db, opts: { since?: Date } = {}): Promise<CalendarBlockSignal[]> {
  const t = s.chatThreads;
  const a = s.availabilityDays;
  const p = s.providerProfiles;
  const u = s.users;
  // The thread stores its two parties unordered; the client is whichever is not the business's own account.
  const clientUserId = sql<string>`case when ${t.aUserId} = ${p.userId} then ${t.bUserId} else ${t.aUserId} end`;
  const rows = await db
    .select({
      threadId: t.id,
      enquiredAt: t.createdAt,
      providerId: p.id,
      providerName: p.displayName,
      clientUserId,
      clientName: u.name,
      clientPhone: u.phone,
      day: t.day,
      blockedAt: a.updatedAt,
    })
    .from(t)
    .innerJoin(p, eq(p.id, t.providerId))
    .innerJoin(a, and(eq(a.providerId, t.providerId), eq(a.day, t.day)))
    .innerJoin(u, eq(u.id, clientUserId))
    .where(
      and(
        eq(t.kind, "client_business"),
        isNotNull(t.day),
        eq(a.status, "blocked"),
        sql`${a.updatedAt} > ${t.createdAt}`,
        opts.since ? gte(a.updatedAt, opts.since) : undefined,
        notExists(
          db
            .select({ one: sql`1` })
            .from(s.bookings)
            .where(and(eq(s.bookings.providerId, t.providerId), eq(s.bookings.day, t.day), eq(s.bookings.clientId, clientUserId))),
        ),
      ),
    )
    .orderBy(desc(a.updatedAt));
  return rows.map((r) => ({
    thread: { id: r.threadId, createdAt: r.enquiredAt },
    provider: { id: r.providerId, name: r.providerName },
    clientUserId: r.clientUserId,
    client: { name: r.clientName, phone: r.clientPhone },
    day: r.day!,
    blockedAt: r.blockedAt,
    enquiredAt: r.enquiredAt,
  }));
}

export type ReportCount = { provider: { id: string; name: string }; open: number };

/** Open reports per business, most reported first. Businesses with none are left out. */
export async function reportCounts(db: Db): Promise<ReportCount[]> {
  const open = sql<number>`count(*)::int`;
  const rows = await db
    .select({ id: s.providerProfiles.id, name: s.providerProfiles.displayName, open })
    .from(s.reports)
    .innerJoin(s.providerProfiles, eq(s.providerProfiles.id, s.reports.subjectProviderId))
    .where(eq(s.reports.status, "open"))
    .groupBy(s.providerProfiles.id, s.providerProfiles.displayName)
    .orderBy(desc(open), s.providerProfiles.displayName);
  return rows.map((r) => ({ provider: { id: r.id, name: r.name }, open: r.open }));
}

/** How far back the desk looks for calendar blocks; reports are open or not and are not windowed. */
export const SIGNAL_WINDOW_DAYS = 30;

/** Both lists for the desk page. `now` is injectable so the page itself stays pure. */
export async function leakageSignals(db: Db, now: Date = new Date()) {
  const since = new Date(now.getTime() - SIGNAL_WINDOW_DAYS * 86_400_000);
  const [blocks, reports] = await Promise.all([calendarBlocksAfterEnquiry(db, { since }), reportCounts(db)]);
  return { blocks, reports, since };
}
