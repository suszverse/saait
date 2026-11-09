import { describe, expect, it } from "vitest";
import { THEME_COOKIE, parseTheme, themeInitScript, themeSchema } from "./theme";

describe("theme", () => {
  it("names the cookie", () => {
    expect(THEME_COOKIE).toBe("saait_theme");
  });

  it("parses known preferences", () => {
    expect(parseTheme("dark")).toBe("dark");
    expect(parseTheme("light")).toBe("light");
    expect(parseTheme("system")).toBe("system");
  });

  it("falls back to system for junk or missing values", () => {
    expect(parseTheme("blue")).toBe("system");
    expect(parseTheme(undefined)).toBe("system");
    expect(parseTheme(null)).toBe("system");
    expect(parseTheme(42)).toBe("system");
  });

  it("schema only accepts the three values", () => {
    expect(themeSchema.safeParse("dark").success).toBe(true);
    expect(themeSchema.safeParse("DARK").success).toBe(false);
  });

  it("init script reads the shared key and the system preference", () => {
    expect(themeInitScript).toContain("saait_theme");
    expect(themeInitScript).toContain("prefers-color-scheme");
    expect(themeInitScript).not.toContain("console.");
  });

  it("init script is syntactically valid JS", () => {
    expect(() => new Function(themeInitScript)).not.toThrow();
  });
});
