import { z } from "zod";

/** Cookie and localStorage key that hold the user's theme preference. */
export const THEME_COOKIE = "saait_theme";

export const themeSchema = z.enum(["system", "light", "dark"]);
export type Theme = z.infer<typeof themeSchema>;

/** Parses a raw cookie/storage value; anything unknown or missing is "system". */
export function parseTheme(raw: unknown): Theme {
  const parsed = themeSchema.safeParse(raw);
  return parsed.success ? parsed.data : "system";
}

/**
 * Minimal blocking script rendered as the first child of <head>, so the
 * resolved theme is on <html data-theme> before first paint. Reads
 * localStorage first (the client's own choice), then the server-set attribute
 * from the cookie, and resolves "system" via prefers-color-scheme. The
 * matchMedia listener is attached only when the preference is "system".
 */
export const themeInitScript = `(function(){try{var d=document.documentElement,k="${THEME_COOKIE}",m=window.matchMedia("(prefers-color-scheme: dark)"),s=null;try{s=localStorage.getItem(k)}catch(e){}var p=s==="light"||s==="dark"||s==="system"?s:(d.dataset.theme==="light"||d.dataset.theme==="dark"?d.dataset.theme:"system");function a(){d.dataset.theme=p==="system"?(m.matches?"dark":"light"):p}a();if(p==="system"){if(m.addEventListener)m.addEventListener("change",a);else if(m.addListener)m.addListener(a)}}catch(e){}})();`;
