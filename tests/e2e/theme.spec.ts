import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

const html = (page: import("@playwright/test").Page) => page.locator("html");
/** The page's ground colour as painted, whether it came from data-theme or the media query. */
const ground = (page: import("@playwright/test").Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
const DARK_GROUND = "rgb(20, 19, 32)"; // --ground #141320
const LIGHT_GROUND = "rgb(255, 255, 255)";

test("the first load follows the device's colour scheme", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await expect(html(page)).toHaveAttribute("data-theme", "dark");

  await page.context().clearCookies();
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await expect(html(page)).toHaveAttribute("data-theme", "light");
});

test("choosing Light survives a reload and System follows the device again", async ({ page }, info) => {
  // Dark on the device, so a Light choice is visibly an override.
  await page.emulateMedia({ colorScheme: "dark" });

  if (info.project.name === "desktop") {
    // Signed out: the header toggle cycles System → Light → Dark.
    await page.goto("/");
    await expect(html(page)).toHaveAttribute("data-theme", "dark");
    await page.getByRole("button", { name: "Theme: System. Switch to Light" }).click();
    await expect(html(page)).toHaveAttribute("data-theme", "light");

    await page.reload();
    await expect(html(page)).toHaveAttribute("data-theme", "light");
    expect((await page.context().cookies()).find((c) => c.name === "saait_theme")?.value).toBe("light");

    await page.getByRole("button", { name: "Theme: Light. Switch to Dark" }).click();
    await page.getByRole("button", { name: "Theme: Dark. Switch to System" }).click();
    await expect(page.getByRole("button", { name: "Theme: System. Switch to Light" })).toBeVisible();
  } else {
    // Phone has no header toggle; a signed-in client uses the control in Settings.
    await page.goto("/settings");
    await signIn(page, "9812345678");
    await expect(page).toHaveURL(/\/settings$/);
    const theme = page.getByRole("radiogroup", { name: "Theme" });
    await theme.getByText("Light", { exact: true }).click();
    await expect(html(page)).toHaveAttribute("data-theme", "light");
    await expect(page.getByText("Saved to your account.")).toBeVisible();

    await page.reload();
    await expect(html(page)).toHaveAttribute("data-theme", "light");
    await expect(theme.getByRole("radio", { name: "Light" })).toBeChecked();
    expect((await page.context().cookies()).find((c) => c.name === "saait_theme")?.value).toBe("light");

    await theme.getByText("System", { exact: true }).click();
    await expect(page.getByText("Saved to your account.")).toBeVisible();
  }

  // System again: the device decides, now and after a reload. data-theme may be
  // resolved or absent here (the CSS falls back to prefers-color-scheme), so check what is painted.
  await expect(html(page)).not.toHaveAttribute("data-theme", "light");
  await expect.poll(() => ground(page)).toBe(DARK_GROUND);
  await page.reload();
  await expect.poll(() => ground(page)).toBe(DARK_GROUND);
  await page.emulateMedia({ colorScheme: "light" });
  await expect.poll(() => ground(page)).toBe(LIGHT_GROUND);
});
