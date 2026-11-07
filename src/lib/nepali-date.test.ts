import { describe, expect, it } from "vitest";
import {
  addDays,
  bsDayMonth,
  bsDayMonthNp,
  bsLongWithGregorian,
  bsMonthYear,
  dayOfWeek,
  daysBetween,
  fromBs,
  isIsoDate,
  toBs,
  todayInNepal,
} from "./nepali-date";

describe("nepali dates", () => {
  it("converts Falgun 12, 2083 to Feb 24, 2027 and back", () => {
    expect(fromBs({ year: 2083, month: 11, day: 12 })).toBe("2027-02-24");
    expect(toBs("2027-02-24")).toEqual({ year: 2083, month: 11, day: 12 });
  });

  it("formats like the design", () => {
    expect(bsDayMonth("2027-02-24")).toBe("Falgun 12");
    expect(bsDayMonthNp("2027-02-24")).toBe("फागुन १२");
    expect(bsMonthYear("2027-02-24")).toBe("Falgun 2083");
    expect(bsLongWithGregorian("2027-02-24")).toBe("Wednesday, Falgun 12, 2083 · Feb 24, 2027");
    expect(dayOfWeek("2027-02-24")).toBe("Wed");
  });

  it("does date arithmetic on ISO strings", () => {
    expect(addDays("2027-02-24", 1)).toBe("2027-02-25");
    expect(addDays("2027-02-28", 1)).toBe("2027-03-01");
    expect(daysBetween("2027-01-24", "2027-02-24")).toBe(31);
  });

  it("rejects impossible BS dates instead of rolling them over", () => {
    expect(fromBs({ year: 2083, month: 11, day: 30 })).toBe("2027-03-14");
    expect(() => fromBs({ year: 2083, month: 11, day: 31 })).toThrow(RangeError);
    expect(() => fromBs({ year: 2083, month: 11, day: 32 })).toThrow(RangeError);
    expect(() => fromBs({ year: 2083, month: 13, day: 1 })).toThrow(RangeError);
    expect(() => fromBs({ year: 2083, month: 0, day: 1 })).toThrow(RangeError);
    expect(() => fromBs({ year: 2083, month: 11, day: 0 })).toThrow(RangeError);
    expect(() => fromBs({ year: 1800, month: 1, day: 1 })).toThrow(RangeError);
  });

  it("validates ISO dates", () => {
    expect(isIsoDate("2027-02-24")).toBe(true);
    expect(isIsoDate("2027-02-30")).toBe(false);
    expect(isIsoDate("24/02/2027")).toBe(false);
  });

  it("knows today in Kathmandu regardless of host zone", () => {
    // 2027-02-23 19:00 UTC is 00:45 on the 24th in Nepal (UTC+5:45).
    expect(todayInNepal(new Date(Date.UTC(2027, 1, 23, 19, 0)))).toBe("2027-02-24");
  });
});
