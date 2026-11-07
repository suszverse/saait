/**
 * The money rules of a booking, from docs/system-plan.md sections 6 and 7.
 * Only the deposit and the platform fees flow through the platform; the
 * balance goes client to provider directly and is never withheld on.
 *
 * Confirm VAT treatment and withholding rates with the chartered accountant
 * before the first paid booking (system plan, section 12).
 */
import { addDays, type IsoDate } from "./nepali-date";
import { add, assertNonNegative, clamp, mulRatio, paisa, percentBp, rupees, sub, type Paisa } from "./money";

export const DEFAULT_DEPOSIT_PERCENT = 25;
export const BOOKING_FEE_BP = 400; // 4%
export const BOOKING_FEE_FLOOR = rupees(500);
export const BOOKING_FEE_CAP = rupees(3_000);
export const VAT_BP = 1_300; // 13%
export const WITHHOLDING_NON_VAT_BP = 1_500; // 15%
export const WITHHOLDING_VAT_BP = 150; // 1.5%
export const URGENT_SURCHARGE = rupees(1_000);
export const URGENT_PROVIDER_SHARE_PERCENT = 60;
export const GUARANTEE_RESERVE_BP = 200; // 2% of booking fees

export function depositFor(agreedTotal: Paisa, depositPercent = DEFAULT_DEPOSIT_PERCENT): Paisa {
  assertNonNegative(agreedTotal, "Agreed total");
  if (!Number.isInteger(depositPercent) || depositPercent < 0 || depositPercent > 100) {
    throw new RangeError("Deposit percent must be an integer from 0 to 100");
  }
  return mulRatio(agreedTotal, depositPercent, 100);
}

/** 4% of the agreed total, at least Rs 500, at most Rs 3,000. */
export function bookingFeeFor(agreedTotal: Paisa): Paisa {
  if (agreedTotal <= 0) throw new RangeError("Agreed total must be positive");
  return clamp(percentBp(agreedTotal, BOOKING_FEE_BP), BOOKING_FEE_FLOOR, BOOKING_FEE_CAP);
}

/**
 * The fee is shown to the client as one VAT-inclusive number (the design
 * shows a single "Booking guarantee fee" line). This splits out the VAT for
 * the invoice: vat = fee * 13 / 113.
 */
export function vatInsideFee(fee: Paisa): { net: Paisa; vat: Paisa } {
  const vat = mulRatio(fee, VAT_BP, 10_000 + VAT_BP);
  return { net: sub(fee, vat), vat };
}

export type Quote = {
  packagePrice: Paisa;
  peakSurcharge: Paisa;
  addons: Paisa;
  agreedTotal: Paisa;
  deposit: Paisa;
  bookingFee: Paisa;
  urgentSurcharge: Paisa;
  payNow: Paisa;
  balance: Paisa;
};

export function quote(input: {
  packagePrice: Paisa;
  peakSurcharge?: Paisa;
  addons?: Paisa[];
  depositPercent?: number;
  urgent?: boolean;
}): Quote {
  assertNonNegative(input.packagePrice, "Package price");
  const peakSurcharge = assertNonNegative(input.peakSurcharge ?? paisa(0), "Peak surcharge");
  const addons = add(paisa(0), ...(input.addons ?? []).map((a) => assertNonNegative(a, "Add-on")));
  const agreedTotal = add(input.packagePrice, peakSurcharge, addons);
  const deposit = depositFor(agreedTotal, input.depositPercent);
  const bookingFee = bookingFeeFor(agreedTotal);
  const urgentSurcharge = input.urgent ? URGENT_SURCHARGE : paisa(0);
  return {
    packagePrice: input.packagePrice,
    peakSurcharge,
    addons,
    agreedTotal,
    deposit,
    bookingFee,
    urgentSurcharge,
    payNow: add(deposit, bookingFee, urgentSurcharge),
    balance: sub(agreedTotal, deposit),
  };
}

/** Withholding applies to the released deposit only, never the balance. */
export function withholdingOnRelease(deposit: Paisa, providerVatRegistered: boolean) {
  assertNonNegative(deposit, "Released deposit");
  const rateBp = providerVatRegistered ? WITHHOLDING_VAT_BP : WITHHOLDING_NON_VAT_BP;
  const withheld = percentBp(deposit, rateBp);
  return { rateBp, withheld, payout: sub(deposit, withheld) };
}

/** Phase 2 hook: the urgent surcharge split, 60% to the provider. */
export function urgentSplit(surcharge: Paisa = URGENT_SURCHARGE) {
  const provider = mulRatio(surcharge, URGENT_PROVIDER_SHARE_PERCENT, 100);
  return { provider, platform: sub(surcharge, provider) };
}

export function guaranteeReserveFor(bookingFee: Paisa): Paisa {
  return percentBp(bookingFee, GUARANTEE_RESERVE_BP);
}

/**
 * Client-cancellation refund of the deposit by days before the event, from
 * the example policy in section 5: full refund more than 30 days out, half at
 * 15 to 30 days, none inside that. The plan leaves day 14 itself unstated;
 * it is treated as inside the window (no refund). The booking fee is never
 * refunded. Stored as a snapshot on each booking so later edits do not apply.
 */
export const DEFAULT_CANCELLATION_POLICY = [
  { minDaysBefore: 31, refundPercent: 100 },
  { minDaysBefore: 15, refundPercent: 50 },
  { minDaysBefore: 0, refundPercent: 0 },
] as const;

export type CancellationPolicy = ReadonlyArray<{ minDaysBefore: number; refundPercent: number }>;

export function clientRefund(deposit: Paisa, daysBefore: number, policy: CancellationPolicy = DEFAULT_CANCELLATION_POLICY): Paisa {
  assertNonNegative(deposit, "Deposit");
  if (!Number.isInteger(daysBefore)) throw new RangeError("Days before the event must be a whole number");
  const tier = [...policy].sort((a, b) => b.minDaysBefore - a.minDaysBefore).find((t) => daysBefore >= t.minDaysBefore);
  return mulRatio(deposit, tier?.refundPercent ?? 0, 100);
}

/**
 * The day before which a client cancellation is fully refunded, for copy
 * like "Full refund if you cancel before Magh 11". Cancelling on this day is
 * 30 days out, which is half. (The design round wrote Magh 12; Magh 2083 has
 * 29 days, so the plan's "more than 30 days" puts it on Magh 11.)
 */
export function fullRefundBefore(eventDay: IsoDate, policy: CancellationPolicy = DEFAULT_CANCELLATION_POLICY): IsoDate {
  const full = [...policy].filter((t) => t.refundPercent === 100).sort((a, b) => a.minDaysBefore - b.minDaysBefore)[0];
  return addDays(eventDay, -((full?.minDaysBefore ?? 1) - 1));
}
