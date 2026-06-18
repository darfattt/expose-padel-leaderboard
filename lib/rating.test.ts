import { describe, expect, it } from "vitest";
import { rankPlayers } from "./leaderboard";
import { levelForRating } from "./levels";
import { capForReliability } from "./rating";
import { normFactor } from "./scoring";
import { aggregateResults, type RawResult } from "./standings";
import type { CareerStatRow } from "./types";

function row(p: Partial<CareerStatRow> & { player_id: string; name: string }): CareerStatRow {
  return {
    games: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    points_for: 0,
    points_against: 0,
    point_diff: 0,
    close_games: 0,
    close_wins: 0,
    score_variance: 0,
    ...p,
  };
}

const field: CareerStatRow[] = [
  row({
    player_id: "ace",
    name: "Ace",
    games: 10,
    wins: 9,
    losses: 1,
    points_for: 190,
    points_against: 110,
    point_diff: 80,
    close_games: 2,
    close_wins: 2,
    score_variance: 5,
  }),
  row({
    player_id: "mid",
    name: "Mid",
    games: 10,
    wins: 5,
    losses: 5,
    points_for: 150,
    points_against: 150,
    point_diff: 0,
    close_games: 5,
    close_wins: 3,
    score_variance: 10,
  }),
  row({
    player_id: "low",
    name: "Low",
    games: 10,
    wins: 1,
    losses: 9,
    points_for: 110,
    points_against: 190,
    point_diff: -80,
    close_games: 2,
    close_wins: 0,
    score_variance: 8,
  }),
  row({
    player_id: "newbie",
    name: "Newbie",
    games: 2,
    wins: 2,
    points_for: 40,
    points_against: 10,
    point_diff: 30,
    score_variance: 1,
  }),
  // A player with zero games must be excluded entirely.
  row({ player_id: "ghost", name: "Ghost" }),
];

describe("rankPlayers", () => {
  const ranked = rankPlayers(field);

  it("excludes players with no games", () => {
    expect(ranked.find((p) => p.row.player_id === "ghost")).toBeUndefined();
    expect(ranked).toHaveLength(4);
  });

  it("ranks the field by rating, best first", () => {
    const rankedOnly = ranked.filter((p) => !p.provisional);
    expect(rankedOnly.map((p) => p.row.player_id)).toEqual(["ace", "mid", "low"]);
    expect(rankedOnly[0].rank).toBe(1);
    expect(rankedOnly[2].rank).toBe(3);
  });

  it("marks sub-threshold players provisional with no rank, sorted last", () => {
    const newbie = ranked.find((p) => p.row.player_id === "newbie")!;
    expect(newbie.provisional).toBe(true);
    expect(newbie.rank).toBeNull();
    expect(ranked[ranked.length - 1].row.player_id).toBe("newbie");
  });

  it("keeps every rating within 0..7", () => {
    for (const p of ranked) {
      expect(p.rating).toBeGreaterThanOrEqual(0);
      expect(p.rating).toBeLessThanOrEqual(7);
    }
  });

  it("maps ratings to Playtomic level bands", () => {
    for (const p of ranked) {
      const level = levelForRating(p.rating);
      expect(level.category).toBeTruthy();
      expect(level.badge).toBeTruthy();
      expect(p.rating).toBeGreaterThanOrEqual(level.min);
    }
  });

  it("holds a thin record below the lowest (level-1.5) reliability gate", () => {
    // A perfect but tiny sample (2 games, +30 net) hasn't cleared even the lowest
    // (level-1.5) bar, so it can't be rated into the 1.5 band.
    const newbie = ranked.find((p) => p.row.player_id === "newbie")!;
    expect(newbie.rating).toBeLessThan(1.5);
  });

  it("gives the dominant player the top rating and a non-balanced archetype", () => {
    const ace = ranked.find((p) => p.row.player_id === "ace")!;
    const low = ranked.find((p) => p.row.player_id === "low")!;
    expect(ace.rating).toBeGreaterThan(low.rating);
    // Top rating among ranked (non-provisional) players.
    const rankedRatings = ranked.filter((p) => !p.provisional).map((p) => p.rating);
    expect(ace.rating).toBe(Math.max(...rankedRatings));
    expect(ace.archetype.key).not.toBe("balanced");
  });
});

describe("capForReliability", () => {
  it("caps a record below the lowest (level-1.5) gate under 1.5", () => {
    expect(capForReliability(6.5, { score: 40, wins: 5 })).toBeLessThan(1.5); // too few net points
    expect(capForReliability(6.5, { score: 200, wins: 3 })).toBeLessThan(1.5); // net ok, too few wins
  });

  it("unlocks one band at a time as net points and wins grow", () => {
    expect(capForReliability(7, { score: 80, wins: 5 })).toBeLessThan(2); // cleared L1.5, not L2
    expect(capForReliability(7, { score: 160, wins: 10 })).toBeLessThan(3); // cleared L2, not L3
    expect(capForReliability(7, { score: 300, wins: 18 })).toBeLessThan(4); // cleared L3, not L4
    expect(capForReliability(7, { score: 480, wins: 30 })).toBeLessThan(5); // cleared L4, not L5
    expect(capForReliability(7, { score: 700, wins: 45 })).toBeLessThan(6); // cleared L5, not L6
    expect(capForReliability(7, { score: 1000, wins: 65 })).toBeLessThan(7); // cleared L6, not L7
  });

  it("lets a fully proven record reach the top of the ladder", () => {
    expect(capForReliability(7, { score: 1240, wins: 85 })).toBe(7);
  });

  it("never lowers a rating already under the unlocked ceiling", () => {
    expect(capForReliability(1.2, { score: 30, wins: 1 })).toBe(1.2);
  });
});

describe("scoring-basis normalization", () => {
  // A fixed-sum "to 5" league: net points accrue in single digits, so the raw
  // reliability gates (tuned for ~21-point games) would strand even a dominant
  // player at the floor. Normalizing to a 21-point equivalent (lib/scoring.ts)
  // restores fair gate progress.
  it("a 'to 5' net-point total clears more gates once normalized", () => {
    const reliability = { score: 54, wins: 11 }; // raw: 11 wins, +54 net in a to-5 league
    const normalized = { score: 54 * normFactor(5), wins: 11 }; // +226.8 normalized

    // Raw is stuck below the lowest (1.5) gate — 54 < the 60-net bar.
    expect(capForReliability(7, reliability)).toBeLessThan(1.5);
    // Normalized clears 1.5 and 2.0 (wins<15 still blocks 3.0).
    expect(capForReliability(7, normalized)).toBeGreaterThanOrEqual(2);
    expect(capForReliability(7, normalized)).toBeLessThan(3);
  });

  // Build identical dominance in a "to 5" field and rank it with vs. without the
  // event basis, end-to-end through aggregateResults + rankPlayers.
  const game = (
    playerId: string,
    name: string,
    points: number,
    conceded: number,
    pointsPerGame?: number
  ): RawResult => ({
    playerId,
    name,
    points,
    conceded,
    won: points > conceded,
    isDraw: points === conceded,
    eventId: "e1",
    playedOn: null,
    pointsPerGame,
  });

  // ace: 11×(5-0) wins + 1×(2-3) loss; mid: even; low: weak. ppg controls basis.
  const field = (ppg?: number): RawResult[] => [
    ...Array.from({ length: 11 }, () => game("ace", "Ace", 5, 0, ppg)),
    game("ace", "Ace", 2, 3, ppg),
    ...Array.from({ length: 6 }, () => game("mid", "Mid", 3, 2, ppg)),
    ...Array.from({ length: 6 }, () => game("mid", "Mid", 2, 3, ppg)),
    ...Array.from({ length: 11 }, () => game("low", "Low", 0, 5, ppg)),
    game("low", "Low", 3, 2, ppg),
  ];

  it("normalizing the basis lifts a dominant 'to 5' player off the gate floor", () => {
    const withBasis = rankPlayers(aggregateResults(field(5)));
    const withoutBasis = rankPlayers(aggregateResults(field())); // basis unknown → factor 1 (raw)

    const aceNorm = withBasis.find((p) => p.row.player_id === "ace")!;
    const aceRaw = withoutBasis.find((p) => p.row.player_id === "ace")!;

    // Same skill, same dominance — but only the normalized record clears gates.
    expect(aceRaw.rating).toBeLessThan(1.5);
    expect(aceNorm.rating).toBeGreaterThanOrEqual(2);
    expect(aceNorm.rating).toBeGreaterThan(aceRaw.rating);
  });

  it("aggregateResults scales norm_point_diff by 21 / basis", () => {
    const [aceRow] = aggregateResults(field(5)).filter((r) => r.player_id === "ace");
    expect(aceRow.point_diff).toBe(54); // raw
    expect(aceRow.norm_point_diff).toBeCloseTo(54 * normFactor(5)); // 226.8
  });
});
