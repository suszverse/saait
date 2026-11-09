/**
 * Account settings. Today that is one field: the theme preference, which the
 * client also keeps in a cookie and localStorage so the first paint is right.
 * The database copy is what follows the user to another device.
 */
import { eq } from "drizzle-orm";
import { type Theme, themeSchema } from "@/lib/theme";
import * as s from "./db/schema";
import type { Db } from "./providers";

/** Validates `raw` against the theme enum and saves it; throws ZodError on anything else. */
export async function setTheme(db: Db, userId: string, raw: unknown): Promise<Theme> {
  const theme = themeSchema.parse(raw);
  await db.update(s.users).set({ theme }).where(eq(s.users.id, userId));
  return theme;
}

export async function getTheme(db: Db, userId: string): Promise<Theme> {
  const [row] = await db.select({ theme: s.users.theme }).from(s.users).where(eq(s.users.id, userId));
  return row?.theme ?? "system";
}
