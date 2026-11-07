import { z } from "zod";

/**
 * Server environment, parsed once. Import from server code only.
 * Failing here at boot is better than failing on the first booking.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  DOCUMENT_KEY: z
    .string()
    .regex(/^[0-9a-f]{64}$/i, "DOCUMENT_KEY must be 32 bytes as 64 hex characters"),
  DOCUMENT_DIR: z.string().default("./.data/documents"),
  SMS_PROVIDER: z.enum(["console"]).default("console"),
  PAYMENT_PROVIDER: z.enum(["manual"]).default("manual"),
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
    cached = parsed.data;
  }
  return cached;
}
