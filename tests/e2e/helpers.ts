import { expect, type Page } from "@playwright/test";
import postgres from "postgres";

export const E2E_DB_NAME = "saait_e2e";
export const E2E_DB_URL = process.env.E2E_DATABASE_URL ?? `postgres://localhost:5432/${E2E_DB_NAME}`;

let sql: ReturnType<typeof postgres> | undefined;
export function db() {
  sql ??= postgres(E2E_DB_URL, { max: 2, onnotice: () => {} });
  return sql;
}

/** The dev SMS sender records every message; read the latest code for a phone. */
export async function latestOtp(phone: string, since: Date): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const rows = await db()`select body from sms_log where "to" = ${phone} and purpose = 'otp' and created_at >= ${since} order by created_at desc limit 1`;
    const m = rows[0]?.body?.match(/code is (\d{6})/);
    if (m) return m[1];
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`no OTP for ${phone}`);
}

/** Signs in from the current login page and waits for the redirect. */
export async function signIn(page: Page, local: string) {
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel("Mobile number").fill(local);
  const since = new Date(Date.now() - 1000);
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByLabel("6-digit code")).toBeVisible();
  const code = await latestOtp(`+977${local}`, since);
  await page.getByLabel("6-digit code").fill(code);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

/** A tiny but real JPEG (SOI + APP0 + padding), enough for the upload sniffer. */
export function jpeg(): Buffer {
  const head = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]);
  return Buffer.concat([head, Buffer.alloc(256, 7), Buffer.from([0xff, 0xd9])]);
}
