import { describe, expect, it } from "vitest";
import { parseClientQuery, queryString } from "./query";

const NOW = new Date("2026-11-08T06:00:00Z");

describe("client URL state", () => {
  it("keeps valid fields when one is hostile", () => {
    expect(parseClientQuery({ date: "2027-02-24", category: "<script>", lat: "99", lng: "83.4", band: "cheapest" }, NOW)).toEqual({
      lat: 27.7006,
      lng: 83.4483,
      radiusKm: 30,
      place: "Traffic Chowk, Butwal",
      date: "2027-02-24",
      category: "wedding-photo",
      band: "any",
    });
  });

  it("defaults to Traffic Chowk and ignores a legacy city param", () => {
    const q = parseClientQuery({ city: "tansen" }, NOW);
    expect(q).toMatchObject({ lat: 27.7006, lng: 83.4483, radiusKm: 30, place: "Traffic Chowk, Butwal" });
    expect(q).not.toHaveProperty("city");
  });

  it("round-trips point, place, radius, category, date and band", () => {
    const q = parseClientQuery({ lat: "27.8673", lng: "83.5467", place: "Tansen Bazaar", radius: "15", date: "2027-02-24", category: "event", band: "30k-60k" }, NOW);
    expect(q).toEqual({ lat: 27.8673, lng: 83.5467, radiusKm: 15, place: "Tansen Bazaar", date: "2027-02-24", category: "event", band: "30k-60k" });
    expect(parseClientQuery(Object.fromEntries(new URLSearchParams(queryString(q))), NOW)).toEqual(q);
  });

  it("drops half a point and its label, and clamps the radius", () => {
    expect(parseClientQuery({ lat: "27.8673", place: "Tansen" }, NOW)).toMatchObject({ lat: 27.7006, lng: 83.4483, place: "Traffic Chowk, Butwal" });
    expect(parseClientQuery({ lat: "27.8673", lng: "83.5467", radius: "500" }, NOW).radiusKm).toBe(30);
    expect(parseClientQuery({ lat: "27.8673", lng: "83.5467", place: "x".repeat(81) }, NOW)).not.toHaveProperty("place");
  });

  it("omits defaults from the query string", () => {
    const qs = queryString({ lat: 27.7006, lng: 83.4483, radiusKm: 30, date: "2027-02-24", category: "wedding-photo", band: "any" });
    expect(qs).toBe("lat=27.7006&lng=83.4483&date=2027-02-24&category=wedding-photo");
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
