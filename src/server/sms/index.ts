/**
 * SMS behind one interface. Phase 1 ships a console sender that logs and
 * records every message; Sparrow SMS or Aakash SMS slots in later behind the
 * same interface once the sender ID is registered (system plan, section 14).
 */
export type SmsPurpose = "otp" | "booking_confirmed" | "booking_held" | "kyc_decision" | "reminder";

export interface SmsSender {
  readonly name: string;
  send(to: string, body: string, purpose: SmsPurpose): Promise<void>;
}

/** Nepali mobile numbers: 97X or 98X followed by 7 digits, stored as E.164. */
export function normalizeNepalPhone(input: string): string | null {
  const digits = input
    .replace(/[०-९]/g, (d) => String("०१२३४५६७८९".indexOf(d)))
    .replace(/\D/g, "")
    .replace(/^00977|^977/, "");
  return /^9[78]\d{8}$/.test(digits) ? `+977${digits}` : null;
}

export function maskPhone(e164: string): string {
  const local = e164.replace(/^\+977/, "");
  return `${local.slice(0, 2)}••••${local.slice(-4)}`;
}
