import { expect, test, type Page } from "@playwright/test";
import { db, newPhone, signIn } from "./helpers";

// Each project joins with its own new numbers; they are removed again at the end.
const created: string[] = [];

test.afterAll(async () => {
  if (created.length === 0) return;
  const phones = created.map((p) => `+977${p}`);
  try {
    // provider_profiles and audit_log do not cascade from users, so they go first, all or nothing.
    await db().begin(async (tx) => {
      const profiles = tx`select id from provider_profiles where user_id in (select id from users where phone in ${tx(phones)})`;
      // A new studio gets a trial subscription and package templates at onboarding.
      await tx`delete from subscriptions where provider_id in (${profiles})`;
      await tx`delete from packages where provider_id in (${profiles})`;
      await tx`delete from provider_profiles where user_id in (select id from users where phone in ${tx(phones)})`;
      await tx`delete from audit_log where actor_id in (select id from users where phone in ${tx(phones)})`;
      await tx`delete from users where phone in ${tx(phones)}`;
    });
  } catch {
    // Another row that still points at the user (reward_ledger, say) blocks the delete; the e2e database is rebuilt next run anyway.
  }
});

/** From /join to the agreement screen as a brand-new number. */
async function joinAs(page: Page, choice: RegExp, kind: string) {
  const local = newPhone();
  created.push(local);
  await page.goto("/join");
  await expect(page.getByRole("heading", { name: "Join Saait" })).toBeVisible();
  await page.getByRole("link", { name: choice }).click();
  await signIn(page, local);
  await expect(page).toHaveURL(new RegExp(`/join/agree\\?kind=${kind}`));

  const agree = page.getByRole("button", { name: "Agree and continue" });
  await expect(agree).toBeDisabled();
  await page.locator("label:has(input[name=accepted]) > span[aria-hidden]").click();
  await expect(page.getByRole("checkbox", { name: /I have read and agree/ })).toBeChecked();
  await expect(agree).toBeEnabled();
  await agree.click();
  await expect(page).toHaveURL(new RegExp(`/provider/onboarding\\?kind=${kind}$`));
  return local;
}

test("a new freelancer agrees to the terms, gets a crew name and stays out of search", async ({ page }) => {
  const local = await joinAs(page, /I am a freelancer/, "freelancer");

  const [accepted] = await db()`select a.version from agreement_acceptances a join users u on u.id = a.user_id where u.phone = ${`+977${local}`}`;
  expect(accepted?.version).toBeTruthy();

  await expect(page.getByLabel("A freelancer")).toBeChecked();
  await page.getByLabel("Your full name, as on your ID").fill("Bikash Thapa");
  await page.getByLabel("One line about your work").fill("Second shooter for weddings");
  await page.getByRole("group", { name: "What you can be hired for" }).getByText("Second shooter", { exact: true }).click();
  await page.getByLabel("Day rate, in rupees").fill("6000");
  await page.getByLabel("Home city").selectOption("butwal");
  await page.getByRole("button", { name: "Continue to verification" }).click();

  // KYC is the hard gate, so onboarding hands every provider to verification next.
  await expect(page).toHaveURL(/\/provider\/kyc$/);
  await page.goto("/crew");
  await expect(page).toHaveURL(/\/crew$/);
  await expect(page.getByRole("main").getByText(/Crew [A-Z]\d-\d{3}/)).toBeVisible();

  // A freelancer is crew for studios, never a public listing.
  const [profile] = await db()`select p.slug, p.alias from provider_profiles p join users u on u.id = p.user_id where u.phone = ${`+977${local}`}`;
  expect(profile.alias).toMatch(/^Crew [A-Z]\d-\d{3}$/);
  const res = await page.goto(`/p/${profile.slug}`);
  expect(res?.status()).toBe(404);
});

test("a new business agrees to the terms, onboards and reaches its own area", async ({ page }) => {
  await joinAs(page, /I run a studio or production house/, "studio");
  await expect(page.getByLabel("A studio with a team")).toBeChecked();
  await page.getByLabel("Your full name, as on your ID").fill("Sita Rai");
  await page.getByLabel("Registered business name").fill("Rai Wedding Studio Pvt. Ltd.");
  await page.getByLabel("Business or display name").fill("Rai Wedding Studio");
  await page.getByLabel("Home city").selectOption("butwal");
  await page.getByRole("group", { name: "What you shoot" }).getByText("Wedding photo", { exact: true }).click();
  await page.getByRole("button", { name: "Continue to verification" }).click();

  // Same gate as freelancers: verification comes next, then the business area is theirs.
  await expect(page).toHaveURL(/\/provider\/kyc$/);
  await page.goto("/business");
  await expect(page).toHaveURL(/\/business$/);
  await expect(page.getByRole("main").getByText("Rai Wedding Studio")).toBeVisible();
});
