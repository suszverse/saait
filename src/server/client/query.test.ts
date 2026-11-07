import { describe, expect, it } from "vitest";
import { parseClientQuery } from "./query";

const NOW = new Date("2026-11-08T06:00:00Z");

describe("client URL state", () => {
  it("keeps valid fields when one is hostile", () => {
    expect(parseClientQuery({ date: "2027-02-24", category: "<script>", city: "../", band: "cheapest" }, NOW)).toEqual({
      city: "butwal",
      date: "2027-02-24",
      category: "wedding-photo",
      band: "any",
    });
  });

  it("falls back to today for past, impossible and far-future dates", () => {
    for (const date of ["2020-01-01", "2027-02-30", "garbage", "2035-01-01", "2200-01-01", "2028-11-08"]) {
      expect(parseClientQuery({ date }, NOW).date).toBe("2026-11-08");
    }
    expect(parseClientQuery({ date: "2028-11-07" }, NOW).date).toBe("2028-11-07");
  });

  it("ignores repeated parameters", () => {
    expect(parseClientQuery({ date: ["2027-02-24", "2027-02-25"] }, NOW).date).toBe("2026-11-08");
  });
});
