/**
 * Money is integer minor units (paisa, 1 rupee = 100 paisa) with a currency
 * alongside. Never floats, never formatted strings in storage. Format only at
 * the edge with `formatRs`.
 */
export const CURRENCY = "NPR" as const;
export type Currency = typeof CURRENCY;

declare const paisaBrand: unique symbol;
/** Integer paisa. The brand keeps rupee numbers from being passed by mistake. */
export type Paisa = number & { readonly [paisaBrand]: true };

export function paisa(value: number): Paisa {
  if (!Number.isSafeInteger(value)) throw new RangeError(`Not an integer paisa amount: ${value}`);
  return value as Paisa;
}

/** Symmetric rounding: -0.005 and 0.005 both move away from zero. */
export function rupees(value: number): Paisa {
  const scaled = Math.round(Math.abs(value) * 100);
  return paisa(value < 0 ? -scaled : scaled);
}

export function assertNonNegative(amount: Paisa, what: string): Paisa {
  if (amount < 0) throw new RangeError(`${what} cannot be negative`);
  return amount;
}

export const ZERO = paisa(0);

export function add(...amounts: Paisa[]): Paisa {
  return paisa(amounts.reduce((sum, a) => sum + a, 0));
}

export function sub(a: Paisa, b: Paisa): Paisa {
  return paisa(a - b);
}

/**
 * Multiply by a ratio given as integer numerator and denominator, rounding
 * half away from zero to the nearest paisa. Integer-only so 25% of 73,000 is
 * exactly 18,250 and never 18,249.999.
 */
export function mulRatio(amount: Paisa, numerator: number, denominator: number): Paisa {
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator) || denominator <= 0) {
    throw new RangeError("Ratio must be integers with a positive denominator");
  }
  const product = BigInt(amount) * BigInt(numerator);
  const d = BigInt(denominator);
  const zero = BigInt(0), one = BigInt(1), two = BigInt(2);
  const sign = product < zero ? -one : one;
  const abs = product < zero ? -product : product;
  const q = (abs * two + d) / (two * d);
  return paisa(Number(sign * q));
}

/** Percent in basis points (1% = 100 bp) keeps 1.5% exact. */
export function percentBp(amount: Paisa, basisPoints: number): Paisa {
  return mulRatio(amount, basisPoints, 10_000);
}

export function clamp(amount: Paisa, min: Paisa, max: Paisa): Paisa {
  return paisa(Math.min(Math.max(amount, min), max));
}

/** Rounds to whole rupees, half up. Used where the price list is in rupees. */
export function roundToRupee(amount: Paisa): Paisa {
  return mulRatio(amount, 1, 100) * 100 as Paisa;
}

const grouping = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 0 });

/** "Rs 65,000" or "Rs 1,234.50". Western grouping, as in the design round copy. */
export function formatRs(amount: Paisa): string {
  const r = amount / 100;
  const s = Number.isInteger(r) ? grouping.format(r) : r.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `Rs ${s}`;
}

/** "Rs 30k" for budget bands. */
export function formatRsShort(amount: Paisa): string {
  const r = amount / 100;
  return r >= 1000 && r % 1000 === 0 ? `Rs ${r / 1000}k` : formatRs(amount);
}
