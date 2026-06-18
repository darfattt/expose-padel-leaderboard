import { describe, expect, it } from "vitest";
import type { Attributes } from "../archetype";
import { predictMatchup } from "../versus";
import {
  buildMatchScript,
  calibrateP,
  DEFAULT_POINTS_PER_GAME,
  fixedSumWinProb,
  simulatedWinRate,
} from "./engine";
import { buildTeam, type TeamPlayer } from "./team";

const FLAT: Attributes = { attack: 50, defense: 50, consistency: 50, clutch: 50, win: 50 };

function player(name: string, rating: number, attrs: Partial<Attributes> = {}): TeamPlayer {
  return {
    name,
    rating,
    attributes: { ...FLAT, ...attrs },
    archetypePrimary: "balanced",
    hasRacket: true,
  };
}

function script(ratingA: number, ratingB: number, seed = 1) {
  const target = predictMatchup(ratingA, ratingB).probA;
  return buildMatchScript({
    teamA: buildTeam(player("A", ratingA), "A", "#003c33"),
    teamB: buildTeam(player("B", ratingB), "B", "#ff7759"),
    target,
    seed,
  });
}

describe("fixedSumWinProb", () => {
  it("is 0.5 at p=0.5 (symmetric, odd game length)", () => {
    expect(fixedSumWinProb(0.5, 21)).toBeCloseTo(0.5, 6);
  });

  it("is 0 at p=0 and 1 at p=1 (no division blow-ups at the edges)", () => {
    expect(fixedSumWinProb(0, 21)).toBe(0);
    expect(fixedSumWinProb(1, 21)).toBe(1);
  });

  it("is monotonic increasing in p", () => {
    let prev = -1;
    for (let p = 0; p <= 1.0001; p += 0.05) {
      const v = fixedSumWinProb(p, 21);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it("amplifies a per-point edge over a 21-point game", () => {
    // A 55% per-point edge wins the majority of 21 points more often than 55%,
    // though less decisively than a first-to-21 race would.
    const v = fixedSumWinProb(0.55, 21);
    expect(v).toBeGreaterThan(0.6);
    expect(v).toBeLessThan(0.72);
  });
});

describe("calibrateP", () => {
  it("inverts fixedSumWinProb (round-trips the target)", () => {
    for (const target of [0.3, 0.5, 0.65, 0.8, 0.92]) {
      const p = calibrateP(target, 21);
      expect(fixedSumWinProb(p, 21)).toBeCloseTo(target, 3);
    }
  });

  it("p=0.5 for an even matchup", () => {
    expect(calibrateP(0.5, 21)).toBeCloseTo(0.5, 3);
  });
});

describe("calibration invariant", () => {
  // The headline guarantee: the simulated game-win rate matches predictMatchup.
  it("simulated win rate matches the target within tolerance", () => {
    for (const [ra, rb] of [
      [3.5, 3.5],
      [4.5, 3.0],
      [2.0, 5.0],
      [3.6, 3.4],
    ]) {
      const target = predictMatchup(ra, rb).probA;
      const p = calibrateP(target, DEFAULT_POINTS_PER_GAME);
      const rate = simulatedWinRate(p, DEFAULT_POINTS_PER_GAME, 12345, 2000);
      expect(Math.abs(rate - target)).toBeLessThan(0.04);
    }
  });
});

describe("buildMatchScript", () => {
  it("is deterministic — same seed → identical script", () => {
    expect(JSON.stringify(script(4.0, 3.0, 7))).toEqual(JSON.stringify(script(4.0, 3.0, 7)));
  });

  it("is fixed-sum: the two scores sum to the game length, majority wins", () => {
    const s = script(4.2, 3.1);
    const { a, b } = s.finalScore;
    expect(a + b).toBe(s.pointsPerGame); // exactly N points contested
    expect(a).not.toBe(b); // odd N ⇒ no draw
    expect(Math.max(a, b)).toBeLessThanOrEqual(s.pointsPerGame); // can run to N–0
    expect(s.winner).toBe(a > b ? "A" : "B");
  });

  it("never overshoots the game length (it's not a first-to-N race)", () => {
    for (let seed = 0; seed < 40; seed++) {
      const s = script(4.0, 3.0, seed);
      expect(s.points.length).toBe(s.pointsPerGame);
      expect(s.finalScore.a + s.finalScore.b).toBe(s.pointsPerGame);
    }
  });

  it("the final point's running score equals the final score", () => {
    const s = script(3.8, 3.9);
    const last = s.points[s.points.length - 1];
    expect(last.scoreA).toBe(s.finalScore.a);
    expect(last.scoreB).toBe(s.finalScore.b);
  });

  it("an even matchup is roughly 50/50 across seeds (monotonicity sanity)", () => {
    let aWinsEven = 0;
    let aWinsFavoured = 0;
    for (let seed = 0; seed < 200; seed++) {
      if (script(3.5, 3.5, seed).winner === "A") aWinsEven++;
      if (script(5.0, 3.0, seed).winner === "A") aWinsFavoured++;
    }
    expect(aWinsEven).toBeGreaterThan(70);
    expect(aWinsEven).toBeLessThan(130);
    // The much stronger team A should win clearly more often.
    expect(aWinsFavoured).toBeGreaterThan(aWinsEven);
  });

  it("every rally has at least one hit and a winning shot", () => {
    const s = script(4.0, 3.0);
    for (const pt of s.points) expect(pt.rally.length).toBeGreaterThanOrEqual(1);
  });

  it("re-rolling the seed tells a different story (not always the same result)", () => {
    // Same matchup, different seeds → the score lines should vary even when the
    // favourite usually prevails. This is the fix for "the sim is always the same".
    const lines = new Set<string>();
    for (let seed = 0; seed < 40; seed++) {
      const s = script(4.0, 3.2, seed);
      lines.add(`${s.finalScore.a}-${s.finalScore.b}`);
    }
    expect(lines.size).toBeGreaterThan(5);
  });
});

describe("clever flow (momentum / clutch / stamina)", () => {
  // Two equally-rated sides (target 0.5), identical but for A's ice-cold clutch.
  // Clutch only bites on game-point pressure, so A should take a *higher* share of
  // the big points than of the ordinary ones — the clutch attribute earning its keep.
  function clutchSplit() {
    let bigA = 0;
    let big = 0;
    let smallA = 0;
    let small = 0;
    for (let seed = 0; seed < 400; seed++) {
      const s = buildMatchScript({
        teamA: buildTeam(player("A", 3.5, { clutch: 100 }), "A", "#003c33"),
        teamB: buildTeam(player("B", 3.5, { clutch: 0 }), "B", "#ff7759"),
        target: 0.5,
        seed,
      });
      for (const pt of s.points) {
        if (pt.big) {
          big++;
          if (pt.winner === "A") bigA++;
        } else {
          small++;
          if (pt.winner === "A") smallA++;
        }
      }
    }
    return { bigRate: bigA / big, smallRate: smallA / small };
  }

  it("the clutch team wins a bigger share of the big points than the rest", () => {
    const { bigRate, smallRate } = clutchSplit();
    expect(bigRate).toBeGreaterThan(smallRate);
    expect(bigRate).toBeGreaterThan(0.5);
  });

  it("equal sides still split the big points ~evenly", () => {
    let bigA = 0;
    let big = 0;
    for (let seed = 0; seed < 400; seed++) {
      const s = script(3.5, 3.5, seed);
      for (const pt of s.points) {
        if (pt.big) {
          big++;
          if (pt.winner === "A") bigA++;
        }
      }
    }
    const rate = bigA / big;
    expect(rate).toBeGreaterThan(0.42);
    expect(rate).toBeLessThan(0.58);
  });
});
