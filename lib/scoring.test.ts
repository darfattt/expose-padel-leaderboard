import { describe, expect, it } from "vitest";
import { CANONICAL_POINTS_PER_GAME, detectPointsPerGame, normFactor } from "./scoring";

describe("detectPointsPerGame", () => {
  it("reads a fixed-sum 'to 5' event as basis 5 (every match sums to 5)", () => {
    const matches = [
      { team1Score: 3, team2Score: 2 },
      { team1Score: 5, team2Score: 0 },
      { team1Score: 1, team2Score: 4 },
    ];
    expect(detectPointsPerGame(matches)).toBe(5);
  });

  it("reads a first-to-21 event as basis 21 (winner constant, totals vary)", () => {
    const matches = [
      { team1Score: 21, team2Score: 12 },
      { team1Score: 8, team2Score: 21 },
      { team1Score: 21, team2Score: 19 },
    ];
    expect(detectPointsPerGame(matches)).toBe(21);
  });

  it("falls back to the highest single-team score when sums are inconsistent", () => {
    const matches = [
      { team1Score: 6, team2Score: 2 },
      { team1Score: 4, team2Score: 3 },
    ];
    expect(detectPointsPerGame(matches)).toBe(6);
  });

  it("defaults to the canonical scale with no matches", () => {
    expect(detectPointsPerGame([])).toBe(CANONICAL_POINTS_PER_GAME);
  });
});

describe("normFactor", () => {
  it("is 1 for the canonical 21-point scale (a no-op)", () => {
    expect(normFactor(21)).toBe(1);
  });

  it("scales a 'to 5' game up so a 5-0 maps to a 21-0 equivalent", () => {
    expect(normFactor(5)).toBeCloseTo(4.2);
    expect(5 * normFactor(5)).toBeCloseTo(21);
  });

  it("defaults to 1 for missing or invalid bases", () => {
    expect(normFactor(null)).toBe(1);
    expect(normFactor(undefined)).toBe(1);
    expect(normFactor(0)).toBe(1);
  });
});
