"use server";

import { cookies } from "next/headers";
import { ZodError } from "zod";
import { THEME_COOKIE } from "@/lib/theme";
import { currentUser } from "@/server/auth/guards";
import { db } from "@/server/db";
import { setTheme } from "@/server/settings";

export type SaveThemeResult = { ok: true } | { error: string };

const ONE_YEAR = 60 * 60 * 24 * 365;

/**
 * Saves the theme to the account and mirrors it in the cookie the root
 * layout reads. "system" clears the cookie so the device decides again.
 */
export async function saveTheme(raw: unknown): Promise<SaveThemeResult> {
  const user = await currentUser();
  if (!user) return { error: "Sign in to save this to your account." };
  try {
    const theme = await setTheme(db(), user.id, raw);
    const jar = await cookies();
    if (theme === "system") jar.delete(THEME_COOKIE);
    else jar.set(THEME_COOKIE, theme, { path: "/", maxAge: ONE_YEAR, sameSite: "lax" });
    return { ok: true };
  } catch (e) {
    if (e instanceof ZodError) return { error: "Choose System, Light or Dark." };
    return { error: "Could not save. It still applies on this device." };
  }
}
