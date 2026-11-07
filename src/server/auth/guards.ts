import "server-only";
import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { db, schema as s } from "../db";
import { getSession, type Role } from "./session";

export type CurrentUser = typeof s.users.$inferSelect;

/** Reads the session and re-checks the role in the database on every call. */
export async function currentUser(): Promise<CurrentUser | null> {
  const session = await getSession();
  if (!session.userId) return null;
  const [u] = await db().select().from(s.users).where(eq(s.users.id, session.userId));
  return u ?? null;
}

export async function requireUser(next: string): Promise<CurrentUser> {
  const u = await currentUser();
  if (!u) redirect(`/login?next=${encodeURIComponent(next)}`);
  return u;
}

export async function requireRole(roles: Role[], next: string): Promise<CurrentUser> {
  const u = await requireUser(next);
  // Hide operator and provider areas from other roles rather than confirm they exist.
  if (!roles.includes(u.role)) notFound();
  return u;
}
