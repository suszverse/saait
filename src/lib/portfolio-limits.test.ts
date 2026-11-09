import { describe, expect, it } from "vitest";
import {
  MAX_CLIP_BYTES,
  MAX_CLIP_SECONDS,
  MAX_PHOTO_BYTES,
  limitsFor,
  nextLimits,
  type LimitsInput,
  type PortfolioLimits,
} from "./portfolio-limits";

const business: PortfolioLimits = { photos: 20, clips: 15 };
const floor: PortfolioLimits = { photos: 12, clips: 6 };
const trusted: PortfolioLimits = { photos: 16, clips: 10 };

// Every kind × plan × level row from section 11 of the proposal.
const rows: [LimitsInput, PortfolioLimits, PortfolioLimits | null][] = [
  // A studio's showcase follows the plan; a lapsed (free) studio keeps the floor. Level never matters.
  [{ kind: "studio", plan: "free", level: "New" }, floor, null],
  [{ kind: "studio", plan: "free", level: "Trusted" }, floor, null],
  [{ kind: "studio", plan: "free", level: "Proven" }, floor, null],
  [{ kind: "studio", plan: "free", level: "Top" }, floor, null],
  [{ kind: "studio", plan: "pro", level: "New" }, business, null],
  [{ kind: "studio", plan: "pro", level: "Trusted" }, business, null],
  [{ kind: "studio", plan: "pro", level: "Proven" }, business, null],
  [{ kind: "studio", plan: "pro", level: "Top" }, business, null],
  [{ kind: "studio", plan: "studio", level: "New" }, business, null],
  [{ kind: "studio", plan: "studio", level: "Trusted" }, business, null],
  [{ kind: "studio", plan: "studio", level: "Proven" }, business, null],
  [{ kind: "studio", plan: "studio", level: "Top" }, business, null],
  // A freelancer's showcase follows the level; the plan never matters.
  [{ kind: "freelancer", plan: "free", level: "New" }, floor, trusted],
  [{ kind: "freelancer", plan: "free", level: "Trusted" }, trusted, business],
  [{ kind: "freelancer", plan: "free", level: "Proven" }, business, business],
  [{ kind: "freelancer", plan: "free", level: "Top" }, business, null],
  [{ kind: "freelancer", plan: "pro", level: "New" }, floor, trusted],
  [{ kind: "freelancer", plan: "pro", level: "Trusted" }, trusted, business],
  [{ kind: "freelancer", plan: "pro", level: "Proven" }, business, business],
  [{ kind: "freelancer", plan: "pro", level: "Top" }, business, null],
  [{ kind: "freelancer", plan: "studio", level: "New" }, floor, trusted],
  [{ kind: "freelancer", plan: "studio", level: "Trusted" }, trusted, business],
  [{ kind: "freelancer", plan: "studio", level: "Proven" }, business, business],
  [{ kind: "freelancer", plan: "studio", level: "Top" }, business, null],
];

describe("limitsFor", () => {
  it.each(rows)("%o", (input, limits) => {
    expect(limitsFor(input)).toEqual(limits);
  });

  it("covers every kind, plan and level", () => {
    expect(rows).toHaveLength(2 * 3 * 4);
  });

  it("never lets a freelancer out-show a business", () => {
    for (const [input, limits] of rows) {
      if (input.kind !== "freelancer") continue;
      expect(limits.photos).toBeLessThanOrEqual(business.photos);
      expect(limits.clips).toBeLessThanOrEqual(business.clips);
    }
  });
});

describe("nextLimits", () => {
  it.each(rows)("%o", (input, _limits, next) => {
    expect(nextLimits(input)).toEqual(next);
  });

  it("only ever grows or holds, so the hint never promises less", () => {
    for (const [, limits, next] of rows) {
      if (!next) continue;
      expect(next.photos).toBeGreaterThanOrEqual(limits.photos);
      expect(next.clips).toBeGreaterThanOrEqual(limits.clips);
    }
  });
});

describe("upload ceilings", () => {
  it("match the proposal: 20 MB photos, 200 MB and 60 s clips", () => {
    expect(MAX_PHOTO_BYTES).toBe(20 * 1024 * 1024);
    expect(MAX_CLIP_BYTES).toBe(200 * 1024 * 1024);
    expect(MAX_CLIP_SECONDS).toBe(60);
  });
});
