import { describe, expect, it } from "vitest";
import { digitRuns, normalise } from "./normalise";

describe("normalise", () => {
  it("folds Devanagari digits and joins spaced groups", () => {
    expect(normalise("९८४१ २३ ४५ ६७")).toContain("9841234567");
  });

  it("removes separators between digits", () => {
    expect(normalise("98 41-23.45 67")).toBe("9841234567");
    expect(digitRuns("call me at 98-41-23-45-67")).toEqual(["9841234567"]);
    expect(digitRuns("98(41)23/45_67")).toEqual(["9841234567"]);
  });

  it("strips zero-width characters inside a number", () => {
    expect(normalise("98​41‌23‍45﻿67")).toBe("9841234567");
  });

  it("maps look-alike letters inside digit runs", () => {
    expect(normalise("984I2O4567")).toBe("9841204567");
    expect(normalise("98 4l 23 45 67")).toBe("9841234567");
    expect(normalise("984S234567")).toBe("9845234567");
    expect(normalise("2S3")).toBe("2s3");
  });

  it("converts runs of English number words", () => {
    expect(normalise("nine eight four one")).toBe("9841");
    expect(normalise("Nine-Eight-Four-One")).toBe("9841");
    expect(normalise("98 oh 41")).toBe("98041");
  });

  it("converts runs of Nepali number words", () => {
    expect(normalise("nau aath")).toBe("98");
    expect(normalise("nau aath chaar ek dui tin char panch chha saat")).toBe("9841234567");
    expect(normalise("नौ आठ चार एक")).toBe("9841");
  });

  it("leaves isolated number words and ordinary numbers alone", () => {
    expect(normalise("500 photos, 10 hours, Falgun 12")).toBe("500 photos, 10 hours, falgun 12");
    expect(normalise("one photographer for one day")).toBe("one photographer for one day");
    expect(normalise("oh no")).toBe("oh no");
    expect(normalise("ramro cha")).toBe("ramro cha");
    expect(normalise("यो राम्रो छ")).toBe("यो राम्रो छ");
  });

  it("does not merge numbers separated by words", () => {
    expect(digitRuns("500 photos, 10 hours, Falgun 12")).toEqual([]);
  });

  it("applies NFKC so fullwidth digits count", () => {
    expect(normalise("９８４１２３４５６７")).toBe("9841234567");
  });
});
