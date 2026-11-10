import { expect, test } from "@playwright/test";
import { db, signIn } from "./helpers";

const BODY = "98 41 23 45 67";
const REASON = "Phone numbers can't be shared on Saait.";

// Rows this test creates; removed at the end so the other project starts clean.
let messageId: string | undefined;
let threadId: string | undefined;

test.afterAll(async () => {
  try {
    if (messageId) await db()`delete from messages where id = ${messageId}`;
    // Only a thread this test left empty goes; messages cascade, reports and bookings would block.
    if (threadId) await db()`delete from chat_threads t where t.id = ${threadId} and t.booking_id is null and not exists (select 1 from messages m where m.thread_id = t.id)`;
  } catch {
    // Something else now points at these rows; the e2e database is rebuilt next run anyway.
  }
  messageId = threadId = undefined;
});

test("a held phone number reaches the business only after an operator clears it", async ({ browser }) => {
  // The client messages the studio and sends a number.
  const client = await browser.newPage();
  await client.goto("/p/shrestha-studio");
  await client.getByRole("button", { name: "Message Shrestha Studio" }).click();
  await signIn(client, "9812345678");
  await expect(client).toHaveURL(/\/p\/shrestha-studio/);
  await client.getByRole("button", { name: "Message Shrestha Studio" }).click();
  await expect(client).toHaveURL(/\/chat\/[0-9a-f-]{36}/);
  threadId = client.url().match(/\/chat\/([0-9a-f-]{36})/)![1];

  await client.getByLabel("Message", { exact: true }).fill(BODY);
  await client.getByRole("button", { name: "Send" }).click();
  const held = client.getByRole("log").locator("li", { hasText: "Not sent" }).filter({ hasText: BODY });
  await expect(held).toBeVisible();
  await expect(held).toContainText(REASON);
  const [row] = await db()`select id from messages where thread_id = ${threadId} and body = ${BODY} and status = 'held' order by created_at desc limit 1`;
  messageId = row.id;

  await held.getByRole("button", { name: "This isn't contact info" }).click();
  await expect(held.getByText("Sent for a second look")).toBeVisible();

  // The business does not see it.
  const business = await browser.newPage();
  await business.goto(`/chat/${threadId}`);
  await signIn(business, "9857000001");
  await expect(business).toHaveURL(new RegExp(`/chat/${threadId}`));
  await expect(business.getByRole("log")).toBeVisible();
  await expect(business.getByRole("log").getByText(BODY)).toHaveCount(0);

  // An operator clears it from the held queue.
  const op = await browser.newPage();
  await op.goto("/admin/chat");
  await signIn(op, "9857099001");
  await op.goto("/admin/chat");
  const flag = op.locator("li", { hasText: "Sunita Sharma" }).filter({ hasText: BODY }).filter({ has: op.getByRole("button", { name: "Clear" }) });
  await expect(flag).toBeVisible();
  await expect(flag).toContainText("appealed");
  await flag.getByRole("button", { name: "Clear" }).click();
  await expect.poll(async () => (await db()`select status from messages where id = ${messageId!}`)[0]?.status).toBe("cleared");

  // Now it is delivered to the business.
  await business.reload();
  await expect(business.getByRole("log").getByText(BODY)).toBeVisible();
  await Promise.all([client.close(), business.close(), op.close()]);
});
