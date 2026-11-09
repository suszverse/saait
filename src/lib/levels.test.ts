import { describe, expect, it } from "vitest";
import { LEVELS, levelFor, nextLevel } from "./levels";

describe("levelFor", () => {
  it("steps up exactly at each threshold", () => {
    expect(levelFor(0)).toBe("New");
    expect(levelFor(299)).toBe("New");
    expect(levelFor(300)).toBe("Trusted");
    expect(levelFor(999)).toBe("Trusted");
    expect(levelFor(1000)).toBe("Proven");
    expect(levelFor(2499)).toBe("Proven");
    expect(levelFor(2500)).toBe("Top");
    expect(levelFor(1_000_000)).toBe("Top");
  });

  it("treats a negative lifetime (penalties outweigh earnings) as New", () => {
    expect(levelFor(-1)).toBe("New");
    expect(levelFor(-5000)).toBe("New");
  });

  it("thresholds are ascending and start at zero", () => {
    expect(LEVELS[0].min).toBe(0);
    for (let i = 1; i < LEVELS.length; i++) expect(LEVELS[i].min).toBeGreaterThan(LEVELS[i - 1].min);
  });
});

describe("nextLevel", () => {
  it("counts points to the next threshold", () => {
    expect(nextLevel(0)).toEqual({ name: "Trusted", pointsToGo: 300 });
    expect(nextLevel(299)).toEqual({ name: "Trusted", pointsToGo: 1 });
    expect(nextLevel(300)).toEqual({ name: "Proven", pointsToGo: 700 });
    expect(nextLevel(999)).toEqual({ name: "Proven", pointsToGo: 1 });
    expect(nextLevel(1000)).toEqual({ name: "Top", pointsToGo: 1500 });
    expect(nextLevel(2499)).toEqual({ name: "Top", pointsToGo: 1 });
  });

  it("is null at the top", () => {
    expect(nextLevel(2500)).toBeNull();
    expect(nextLevel(99_999)).toBeNull();
  });

  it("does not ask a negative balance to climb out of the hole first", () => {
    expect(nextLevel(-200)).toEqual({ name: "Trusted", pointsToGo: 300 });
  });
});
