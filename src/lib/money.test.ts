import { describe, expect, it } from "vitest";
import { add, clamp, formatRs, formatRsShort, mulRatio, paisa, percentBp, roundToRupee, rupees, sub } from "./money";

describe("money", () => {
  it("rejects non-integer paisa", () => {
    expect(() => paisa(1.5)).toThrow(RangeError);
    expect(() => paisa(Number.MAX_SAFE_INTEGER + 2)).toThrow(RangeError);
  });

  it("converts rupees to paisa without float drift", () => {
    expect(rupees(0.1) + rupees(0.2)).toBe(30);
    expect(rupees(73_000)).toBe(7_300_000);
  });

  it("rounds rupees symmetrically", () => {
    expect(rupees(0.005)).toBe(1);
    expect(rupees(-0.005)).toBe(-1);
  });

  it("adds and subtracts", () => {
    expect(add(rupees(65_000), rupees(8_000))).toBe(rupees(73_000));
    expect(sub(rupees(73_000), rupees(18_250))).toBe(rupees(54_750));
  });

  it("rounds ratios half away from zero", () => {
    expect(mulRatio(paisa(5), 1, 2)).toBe(3);
    expect(mulRatio(paisa(-5), 1, 2)).toBe(-3);
    expect(mulRatio(paisa(4), 1, 3)).toBe(1);
  });

  it("applies basis points exactly", () => {
    expect(percentBp(rupees(18_250), 150)).toBe(27_375); // 1.5% of 18,250 = 273.75
    expect(percentBp(rupees(73_000), 400)).toBe(rupees(2_920));
  });

  it("clamps", () => {
    expect(clamp(rupees(100), rupees(500), rupees(3_000))).toBe(rupees(500));
    expect(clamp(rupees(9_000), rupees(500), rupees(3_000))).toBe(rupees(3_000));
  });

  it("rounds to whole rupees", () => {
    expect(roundToRupee(paisa(27_375))).toBe(27_400);
    expect(roundToRupee(paisa(27_349))).toBe(27_300);
  });

  it("formats at the edge only", () => {
    expect(formatRs(rupees(65_000))).toBe("Rs 65,000");
    expect(formatRs(rupees(120_000))).toBe("Rs 120,000");
    expect(formatRs(paisa(27_375))).toBe("Rs 273.75");
    expect(formatRsShort(rupees(30_000))).toBe("Rs 30k");
  });
});
