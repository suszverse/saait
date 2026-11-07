import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

const DATE = "2027-02-24"; // Falgun 12, 2083, a wedding date in the seed

// The suite runs on a phone and on a desktop against one database, so each
// run reads the slots it starts with instead of assuming a fresh seed.
test("a client finds a free provider and locks the date with a deposit", async ({ page }) => {
  await page.goto(`/?city=butwal&date=${DATE}&category=wedding-photo`);
  await expect(page.getByText("Falgun 12 is a wedding date.")).toBeVisible();

  await page.getByRole("link", { name: /^See all/ }).click();
  await expect(page.getByRole("heading", { name: "Wedding photo, Falgun 12" })).toBeVisible();
  await expect(page.getByText("sorted by rating")).toBeVisible();

  await page.getByRole("link", { name: /Shrestha Studio/ }).first().click();
  await expect(page.getByRole("heading", { name: "Shrestha Studio" })).toBeVisible();
  const before = Number((await page.getByText(/Free on Falgun 12 · \d of 3 slots left/).textContent())!.match(/(\d) of 3/)![1]);
  await page.getByRole("radio", { name: /Standard/ }).check({ force: true });
  await page.getByRole("button", { name: /Lock Falgun 12/ }).click();

  await signIn(page, "9812345678");
  await expect(page.getByRole("heading", { name: "Lock Falgun 12" })).toBeVisible();
  const payNow = page.locator("dl div", { hasText: "Pay now to lock the date" });
  await expect(payNow).toContainText("Rs 21,170");
  await expect(page.getByText("Rs 54,750")).toBeVisible();
  await expect(page.getByText("Full refund if you cancel before Magh 11.", { exact: false })).toBeVisible();

  await page.getByLabel("Venue").fill("Siddhartha Party Palace, Butwal");
  await page.getByRole("button", { name: "Pay Rs 21,170 with eSewa" }).click();

  await expect(page).toHaveURL(/\/bookings\/SA-\d+\/pay$/);
  const code = page.url().match(/SA-\d+/)![0];
  await expect(page.getByText(code).first()).toBeVisible();
  await page.getByRole("button", { name: /Simulate eSewa payment/ }).click();

  await expect(page).toHaveURL(new RegExp(`/bookings/${code}$`));
  await expect(page.getByText("Your date is locked")).toBeVisible();
  await expect(page.getByText(`Booking ${code}`)).toBeVisible();
  await expect(page.locator("dl div", { hasText: "Deposit held by Saait" })).toContainText("Rs 18,250");
  await expect(page.getByText("Locked", { exact: true })).toBeVisible();

  // The slot is taken.
  await page.goto(`/p/shrestha-studio?city=butwal&date=${DATE}&category=wedding-photo`);
  await expect(page.getByText(before - 1 > 0 ? `Free on Falgun 12 · ${before - 1} of 3 slots left` : "Not free on Falgun 12")).toBeVisible();
});
