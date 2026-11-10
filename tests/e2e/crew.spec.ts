import { expect, test } from "@playwright/test";
import { db, signIn } from "./helpers";

// Each project hires on its own day, so a freelancer is never already booked by the other run.
const DAY = { phone: "2027-03-10", desktop: "2027-03-11" } as const;

let jobId: string | undefined;

test.afterAll(async () => {
  try {
    if (jobId) await db()`delete from crew_jobs where id = ${jobId}`;
  } catch {
    // A review or reward row now points at the job; the e2e database is rebuilt next run anyway.
  }
  jobId = undefined;
});

test("a studio hires crew and sees their name and number only once they accept", async ({ browser }, info) => {
  const day = DAY[info.project.name as keyof typeof DAY];

  // The studio finds crew free that day and opens a profile.
  const biz = await browser.newPage();
  await biz.goto(`/business/crew?day=${day}`);
  await signIn(biz, "9857000001");
  await biz.goto(`/business/crew?day=${day}`);
  await expect(biz.getByRole("heading", { name: "Find crew" })).toBeVisible();
  const card = biz.getByRole("list", { name: "Crew" }).getByRole("link").first();
  const alias = (await card.locator("span.font-bold").first().textContent())!.trim();
  expect(alias).toMatch(/^Crew [A-Z]\d-\d{3}$/);
  await card.click();
  await expect(biz.getByRole("heading", { name: alias, level: 1 })).toBeVisible();

  const [crew] = await db()`select u.phone, coalesce(u.name, p.display_name) as name from provider_profiles p join users u on u.id = p.user_id where p.alias = ${alias}`;
  const tel = biz.locator(`a[href="tel:${crew.phone}"]`);

  await expect(biz.getByLabel("Day", { exact: true })).toHaveValue(day);
  // Some crew leave the rate to be agreed; the offer still needs one.
  const rate = biz.getByLabel("Day rate (Rs)");
  if (!(await rate.inputValue())) await rate.fill("6000");
  await biz.getByRole("button", { name: /^Hire for / }).click();
  await expect(biz.getByText("Offer sent.", { exact: false })).toBeVisible();
  const [job] = await db()`select j.id from crew_jobs j join provider_profiles f on f.id = j.freelancer_id where f.alias = ${alias} and j.day = ${day} and j.status = 'offered'`;
  jobId = job.id;

  // Before they accept: the alias, no name, no number.
  await biz.goto("/business/crew/jobs");
  await expect(biz.getByText("Their name and number show here once they accept.").first()).toBeVisible();
  await expect(biz.getByRole("heading", { name: alias }).first()).toBeVisible();
  await expect(tel).toHaveCount(0);
  await expect(biz.getByText(crew.name, { exact: true })).toHaveCount(0);

  // The freelancer accepts.
  const free = await browser.newPage();
  await free.goto("/crew/jobs");
  await signIn(free, crew.phone.replace(/^\+977/, ""));
  await free.goto("/crew/jobs");
  const offer = free.locator(`li:has(input[name=jobId][value="${jobId}"])`);
  await expect(offer).toContainText("Shrestha Studio");
  await offer.getByRole("button", { name: "Accept" }).click();
  await expect.poll(async () => (await db()`select status from crew_jobs where id = ${jobId!}`)[0]?.status).toBe("accepted");

  // Now the studio sees who and how to call.
  await biz.reload();
  await expect(biz.getByRole("heading", { name: crew.name }).first()).toBeVisible();
  await expect(tel.first()).toBeVisible();
  await Promise.all([biz.close(), free.close()]);
});
