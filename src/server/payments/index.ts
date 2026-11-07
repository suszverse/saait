/**
 * Payments behind one interface (system plan section 10). Phase 1 ships the
 * manual gateway: the client sends the deposit to the company's eSewa,
 * Khalti or Fonepay merchant account with the booking code, and the payment
 * is confirmed through the same signed webhook a real gateway will call.
 * eSewa and Khalti implementations slot in behind this interface once the
 * merchant agreements exist (section 12).
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const PAYMENT_METHODS = ["esewa", "khalti", "fonepay"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const METHOD_LABEL: Record<PaymentMethod, string> = { esewa: "eSewa", khalti: "Khalti", fonepay: "Fonepay QR" };

export type StartPayment = { paymentId: string; bookingCode: string; amount: number; method: PaymentMethod };

export interface PaymentGateway {
  readonly name: string;
  /** Where to send the client to pay. */
  start(p: StartPayment): Promise<{ redirectTo: string; gatewayRef: string }>;
  /** Verify a webhook body and signature; returns the gateway reference that succeeded. */
  verifyWebhook(body: string, signature: string | null): { gatewayRef: string; amount: number; status: "succeeded" | "failed" } | null;
}

export function sign(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

export function signatureOk(secret: string, body: string, signature: string | null): boolean {
  if (!signature || !/^[0-9a-f]{64}$/.test(signature)) return false;
  const a = Buffer.from(sign(secret, body), "hex");
  const b = Buffer.from(signature, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
