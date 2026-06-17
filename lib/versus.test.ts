import { describe, expect, it } from "vitest";
import { H2H_HALF_WEIGHT, predictMatchup, ratingWinProb } from "./versus";

describe("ratingWinProb", () => {
  it("is a coin flip for equal ratings", () => {
    expect(ratingWinProb(5, 5)).toBeCloseTo(0.5, 10);
  });

  it("favours the higher-rated player", () => {
    expect(ratingWinProb(7, 5)).toBeGreaterThan(0.5);
    expect(ratingWinProb(5, 7)).toBeLessThan(0.5);
  });

  it("is symmetric — the two players' probabilities sum to 1", () => {
    expect(ratingWinProb(6.2, 4.8) + ratingWinProb(4.8, 6.2)).toBeCloseTo(1, 10);
  });

  it("turns a 1.0-point edge into roughly 65%", () => {
    expect(ratingWinProb(6, 5)).toBeCloseTo(0.6457, 3);
  });

  it("grows monotonically with the gap", () => {
    expect(ratingWinProb(6, 5)).toBeLessThan(ratingWinProb(7, 5));
  });
});

describe("predictMatchup", () => {
  it("uses the rating prior alone when they have never met", () => {
    const p = predictMatchup(6, 5);
    expect(p.basis).toBe("rating");
    expect(p.h2hWeight).toBe(0);
    expect(p.probA).toBeCloseTo(p.ratingProbA, 10);
    expect(p.probA + p.probB).toBeCloseTo(1, 10);
  });

  it("ignores a head-to-head record below the shared-games threshold", () => {
    const p = predictMatchup(6, 5, { wins: 2, games: 2 });
    expect(p.basis).toBe("rating");
    expect(p.probA).toBeCloseTo(p.ratingProbA, 10);
  });

  it("blends a qualifying head-to-head record toward the empirical rate", () => {
    // Lower-rated A but dominant record: prediction should sit between the
    // rating prior (<0.5) and the empirical win rate (1.0), above the prior.
    const p = predictMatchup(5, 6, { wins: 9, games: 10 });
    expect(p.basis).toBe("rating+h2h");
    expect(p.probA).toBeGreaterThan(p.ratingProbA);
    expect(p.probA).toBeLessThan(0.9); // empirical rate, not yet fully trusted
    expect(p.probA + p.probB).toBeCloseTo(1, 10);
  });

  it("weights the record more as the sample grows", () => {
    const few = predictMatchup(5, 6, { wins: 3, games: 3 });
    const many = predictMatchup(5, 6, { wins: 30, games: 30 });
    expect(many.h2hWeight).toBeGreaterThan(few.h2hWeight);
    expect(many.probA).toBeGreaterThan(few.probA);
  });

  it("splits weight evenly with the prior at the half-weight sample size", () => {
    const p = predictMatchup(5, 6, { wins: H2H_HALF_WEIGHT, games: H2H_HALF_WEIGHT });
    expect(p.h2hWeight).toBeCloseTo(0.5, 10);
  });
});
