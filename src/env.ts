import { z } from "zod";

/**
 * Server environment, parsed once. Import from server code only.
 * Failing here at boot is better than failing on the first booking.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  /**
   * Where this copy runs. NODE_ENV is "production" for every `next build`,
   * including local ones, so safety switches key off this instead.
   */
  DEPLOY_ENV: z.enum(["local", "staging", "production"]).optional(),
  DATABASE_URL: z.string().url(),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  DOCUMENT_KEY: z
    .string()
    .regex(/^[0-9a-f]{64}$/i, "DOCUMENT_KEY must be 32 bytes as 64 hex characters"),
  DOCUMENT_DIR: z.string().default("./.data/documents"),
  SMS_PROVIDER: z.enum(["console"]).default("console"),
  PAYMENT_PROVIDER: z.enum(["manual"]).default("manual"),
  /** Signs payment webhooks. 32+ random characters. */
  PAYMENT_WEBHOOK_SECRET: z.string().min(32, "PAYMENT_WEBHOOK_SECRET must be at least 32 characters"),
  /** Shows a "simulate payment" button on the pay page. Never on in production. */
  PAYMENT_SIMULATOR: z.enum(["on", "off"]).default("off"),
  /** WhatsApp number of the Saait desk, digits only with country code. */
  DESK_WHATSAPP: z.string().regex(/^977\d{10}$/).default("9779857000001"),
  APP_URL: z.string().url().default("http://localhost:3000"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n");
      throw new Error(`Invalid environment:\n${issues}`);
    }
    // Fail closed: the simulator lets a client confirm without paying, so it
    // needs an explicit local or staging deployment, never a default.
    if (parsed.data.PAYMENT_SIMULATOR === "on" && parsed.data.DEPLOY_ENV !== "local" && parsed.data.DEPLOY_ENV !== "staging") {
      throw new Error("Invalid environment:\nPAYMENT_SIMULATOR=on needs DEPLOY_ENV set to local or staging");
    }
    cached = parsed.data;
  }
  return cached;
}
