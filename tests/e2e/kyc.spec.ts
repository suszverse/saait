import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { db, jpeg, signIn } from "./helpers";

/** The terms version shipped in src/content/terms.md, so the acceptance below matches what the server checks. */
const TERMS_VERSION = readFileSync("src/content/terms.md", "utf8").match(/^version:\s*(\S+)/m)?.[1] ?? "";

const DATE = "2027-02-26"; // Falgun 14
const RESULTS = `/results?city=butwal&date=${DATE}&category=wedding-photo`;
test("an unverified provider stays out of search until an operator approves them", async ({ browser }, info) => {
  // Each project (phone, desktop) onboards its own provider.
  const n = info.project.name === "desktop" ? 2 : 1;
  const NAME = n === 1 ? "Pokhreli Frames" : "Pokhreli Films";
  const SLUG = n === 1 ? "pokhreli-frames" : "pokhreli-films";
  // Provider signs up and completes KYC.
  const prov = await browser.newPage();
  await prov.goto("/provider/onboarding");
  await signIn(prov, `986660000${n}`);
  // Onboarding refuses anyone who has not accepted the terms. Until the join
  // flow (/join/agree) lands, record the acceptance directly.
  await db()`insert into agreement_acceptances (user_id, version) select id, ${TERMS_VERSION} from users where phone = ${`+977986660000${n}`} on conflict do nothing`;
  // Only a studio is listed to clients; a freelancer is crew hired by studios.
  await prov.goto("/provider/onboarding?kind=studio");
  await expect(prov.getByLabel("A studio with a team")).toBeChecked();
  await prov.getByLabel("Your full name, as on your ID").fill(`Ram Pokhrel ${n}`);
  await prov.getByLabel("Registered business name").fill(`${NAME} Pvt. Ltd.`);
  await prov.getByLabel("Business or display name").fill(NAME);
  await prov.getByLabel("Home city").selectOption("butwal");
  await prov.getByText("Wedding photo", { exact: true }).click();
  await prov.getByRole("button", { name: "Continue to verification" }).click();
  await expect(prov.getByRole("heading", { name: "Get verified" })).toBeVisible();

  for (const label of ["Front", "Back", "Selfie"]) {
    const input = prov.locator(`form:has(span:text-is("${label}")) input[type=file]`).first();
    await input.setInputFiles({ name: `${label}.jpg`, mimeType: "image/jpeg", buffer: jpeg() });
    await expect(prov.locator(`form:has(span:text-is("${label}"))`).getByText("Uploaded")).toBeVisible();
  }
  await prov.getByLabel("ID number").fill(`33-01-80-0123${n}`);
  await prov.getByRole("button", { name: "Continue to PAN" }).click();
  await prov.locator('form:has(span:text-is("PAN certificate")) input[type=file]').first().setInputFiles({ name: "pan.jpg", mimeType: "image/jpeg", buffer: jpeg() });
  await expect(prov.getByText("Uploaded")).toBeVisible();
  await prov.getByLabel("PAN number").fill(`61234567${n}`);
  await prov.getByRole("button", { name: "Continue to payout" }).click();
  await prov.locator('form:has(span:text-is("Proof of account")) input[type=file]').first().setInputFiles({ name: "acct.jpg", mimeType: "image/jpeg", buffer: jpeg() });
  await expect(prov.getByText("Uploaded")).toBeVisible();
  await prov.getByLabel("Name on the account").fill(NAME);
  await prov.getByLabel("Account or wallet number").fill(`986660000${n}`);
  await prov.getByRole("button", { name: "Continue to review" }).click();
  await prov.getByRole("button", { name: "Send for verification" }).click();
  await expect(prov.getByText("With our team.")).toBeVisible();

  // A client cannot see them.
  const client = await browser.newPage();
  await client.goto(RESULTS);
  await expect(client.getByText(/free · sorted by rating/)).toBeVisible();
  await expect(client.getByText(NAME)).toHaveCount(0);
  const hidden = await client.goto(`/p/${SLUG}`);
  expect(hidden?.status()).toBe(404);

  // The operator reviews and approves with all six checks.
  const op = await browser.newPage();
  await op.goto("/admin/kyc");
  await signIn(op, "9857099001");
  await op.goto("/admin/kyc");
  await op.getByRole("link", { name: new RegExp(NAME) }).click();
  await op.getByRole("button", { name: "Open review" }).click();
  const approve = op.getByRole("button", { name: "Approve as Verified" });
  await expect(approve).toBeDisabled();
  for (const label of [
    "ID is legible and not expired",
    "Selfie matches the ID photo",
    "PAN name matches ID name",
    "Payout account name matches",
    "Portfolio is original (3 images spot checked)",
    "No duplicate phone, ID or PAN",
  ]) {
    await op.getByText(label, { exact: true }).click();
  }
  await expect(approve).toBeEnabled();
  await approve.click();
  await expect(op).toHaveURL(/\/admin\/kyc$/);

  // Now the client sees them.
  await client.goto(RESULTS);
  await expect(client.getByText(NAME)).toBeVisible();
  const visible = await client.goto(`/p/${SLUG}`);
  expect(visible?.status()).toBe(200);
  await Promise.all([prov.close(), client.close(), op.close()]);
});
