import { afterEach, describe, expect, it, vi } from "vitest";

const base = {
  DATABASE_URL: "postgres://localhost/x",
  SESSION_SECRET: "s".repeat(32),
  DOCUMENT_KEY: "a".repeat(64),
  PAYMENT_WEBHOOK_SECRET: "w".repeat(32),
};

async function load(over: Record<string, string | undefined>) {
  vi.resetModules();
  const saved = { ...process.env };
  for (const k of Object.keys(process.env)) delete process.env[k];
  Object.assign(process.env, base, over);
  try {
    const { env } = await import("./env");
    return env();
  } finally {
    for (const k of Object.keys(process.env)) delete process.env[k];
    Object.assign(process.env, saved);
  }
}

afterEach(() => vi.resetModules());

describe("env", () => {
  it("refuses the payment simulator unless the deployment is explicitly local or staging", async () => {
    await expect(load({ PAYMENT_SIMULATOR: "on" })).rejects.toThrow("DEPLOY_ENV");
    await expect(load({ PAYMENT_SIMULATOR: "on", DEPLOY_ENV: "production" })).rejects.toThrow("DEPLOY_ENV");
    expect((await load({ PAYMENT_SIMULATOR: "on", DEPLOY_ENV: "local" })).PAYMENT_SIMULATOR).toBe("on");
    expect((await load({ DEPLOY_ENV: "production" })).PAYMENT_SIMULATOR).toBe("off");
  });

  it("refuses a short document key", async () => {
    await expect(load({ DOCUMENT_KEY: "abc" })).rejects.toThrow("DOCUMENT_KEY");
  });
});
