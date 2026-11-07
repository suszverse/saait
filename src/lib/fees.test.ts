import { describe, expect, it } from "vitest";
import { add, paisa, rupees } from "./money";
import { bsDayMonth, daysBetween } from "./nepali-date";
import {
  bookingFeeFor,
  clientRefund,
  depositFor,
  fullRefundBefore,
  guaranteeReserveFor,
  quote,
  urgentSplit,
  vatInsideFee,
  withholdingOnRelease,
} from "./fees";

describe("booking fee", () => {
  it("is 4% of the agreed total", () => {
    expect(bookingFeeFor(rupees(73_000))).toBe(rupees(2_920));
  });
  it("has a Rs 500 floor", () => {
    expect(bookingFeeFor(rupees(5_000))).toBe(rupees(500));
  });
  it("has a Rs 3,000 cap", () => {
    expect(bookingFeeFor(rupees(120_000))).toBe(rupees(3_000));
  });
  it("carries 13% VAT inside the fee", () => {
    const { net, vat } = vatInsideFee(rupees(2_920));
    expect(net + vat).toBe(rupees(2_920));
    expect(vat).toBe(33_593); // 2,920 * 13/113 = 335.93
  });
});

describe("deposit", () => {
  it("defaults to 25%", () => {
    expect(depositFor(rupees(73_000))).toBe(rupees(18_250));
  });
  it("honours a package's own percentage", () => {
    expect(depositFor(rupees(40_000), 30)).toBe(rupees(12_000));
  });
  it("rejects nonsense percentages", () => {
    expect(() => depositFor(rupees(1_000), 120)).toThrow(RangeError);
  });
});

describe("quote", () => {
  it("matches the Lock the date screen", () => {
    const q = quote({ packagePrice: rupees(65_000), peakSurcharge: rupees(8_000) });
    expect(q.agreedTotal).toBe(rupees(73_000));
    expect(q.deposit).toBe(rupees(18_250));
    expect(q.bookingFee).toBe(rupees(2_920));
    expect(q.payNow).toBe(rupees(21_170));
    expect(q.balance).toBe(rupees(54_750));
  });
  it("adds add-ons into the agreed total", () => {
    const q = quote({ packagePrice: rupees(65_000), peakSurcharge: rupees(8_000), addons: [rupees(12_000)] });
    expect(q.agreedTotal).toBe(rupees(85_000));
    expect(q.bookingFee).toBe(rupees(3_000));
  });
  it("charges the urgent surcharge on top, now", () => {
    const q = quote({ packagePrice: rupees(35_000), urgent: true });
    expect(q.payNow).toBe(rupees(8_750 + 1_400 + 1_000));
    expect(q.balance).toBe(rupees(26_250));
  });
});

describe("withholding", () => {
  it("is 15% of the released deposit for a non-VAT provider", () => {
    const w = withholdingOnRelease(rupees(18_250), false);
    expect(w.withheld).toBe(rupees(2_737.5));
    expect(w.payout).toBe(rupees(15_512.5));
  });
  it("is 1.5% for a VAT-registered provider", () => {
    expect(withholdingOnRelease(rupees(18_250), true).withheld).toBe(rupees(273.75));
  });
});

describe("urgent split and reserve", () => {
  it("passes Rs 600 of Rs 1,000 to the provider", () => {
    expect(urgentSplit()).toEqual({ provider: rupees(600), platform: rupees(400) });
  });
  it("reserves 2% of the booking fee", () => {
    expect(guaranteeReserveFor(rupees(2_920))).toBe(rupees(58.4));
  });
});

describe("client refund", () => {
  it("is full more than 30 days out", () => expect(clientRefund(rupees(18_250), 31)).toBe(rupees(18_250)));
  it("is half from 15 to 30 days", () => {
    expect(clientRefund(rupees(18_250), 30)).toBe(rupees(9_125));
    expect(clientRefund(rupees(18_250), 15)).toBe(rupees(9_125));
  });
  it("is nothing inside 15 days", () => expect(clientRefund(rupees(18_250), 14)).toBe(0));
});

describe("edges", () => {
  it("sits exactly on the floor and the cap", () => {
    expect(bookingFeeFor(rupees(12_500))).toBe(rupees(500));
    expect(bookingFeeFor(rupees(12_512.5))).toBe(rupees(500.5));
    expect(bookingFeeFor(rupees(75_000))).toBe(rupees(3_000));
    expect(bookingFeeFor(rupees(74_975))).toBe(rupees(2_999));
  });

  it("rejects negative or empty money", () => {
    expect(() => quote({ packagePrice: rupees(-73_000) })).toThrow(RangeError);
    expect(() => quote({ packagePrice: rupees(65_000), addons: [rupees(-1)] })).toThrow(RangeError);
    expect(() => bookingFeeFor(rupees(0))).toThrow(RangeError);
    expect(() => withholdingOnRelease(rupees(-1), false)).toThrow(RangeError);
    expect(() => clientRefund(rupees(-1), 40)).toThrow(RangeError);
    expect(() => clientRefund(rupees(100), Number.NaN)).toThrow(RangeError);
  });

  it("always splits odd paisa so deposit plus balance is the total", () => {
    for (const total of [7_300_001, 7_300_002, 7_300_003, 1, 99]) {
      const q = quote({ packagePrice: paisa(total) });
      expect(add(q.deposit, q.balance)).toBe(total);
    }
  });

  it("never withholds on the balance", () => {
    const q = quote({ packagePrice: rupees(65_000), peakSurcharge: rupees(8_000) });
    const w = withholdingOnRelease(q.deposit, false);
    expect(w.withheld).toBe(rupees(2_737.5));
    expect(Object.keys(q)).not.toContain("withheld");
    expect(q.balance).toBe(rupees(54_750));
  });

  it("treats day 14 as inside the no-refund window", () => {
    expect(clientRefund(rupees(18_250), 14)).toBe(0);
  });

  // The design copy says "before Magh 12" for a Falgun 12 event. Magh 2083
  // has 29 days, so the plan's "more than 30 days out" makes it Magh 11.
  // The plan wins; the copy is generated from the policy.
  it("derives the full-refund deadline from the policy", () => {
    const before = fullRefundBefore("2027-02-24");
    expect(bsDayMonth(before)).toBe("Magh 11");
    expect(clientRefund(rupees(18_250), daysBetween(before, "2027-02-24"))).toBe(rupees(9_125));
    expect(clientRefund(rupees(18_250), daysBetween(before, "2027-02-24") + 1)).toBe(rupees(18_250));
  });
});
