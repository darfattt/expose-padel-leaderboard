import { describe, expect, it } from "vitest";
import { rankPlayers } from "./leaderboard";
import { levelForRating } from "./levels";
import { capForReliability } from "./rating";
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

  it("holds a thin record below the level-4 reliability gate", () => {
    // A perfect but tiny sample (2 games, 2 wins) hasn't cleared even the
    // level-4 bar, so it can't be rated into the 4.x band.
    const newbie = ranked.find((p) => p.row.player_id === "newbie")!;
    expect(newbie.rating).toBeLessThan(4);
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
  it("caps a record below the level-4 gate under 4.0", () => {
    expect(capForReliability(6.5, { games: 3, wins: 3 })).toBeLessThan(4);
    expect(capForReliability(6.5, { games: 20, wins: 4 })).toBeLessThan(4); // games ok, too few wins
  });

  it("unlocks one band at a time as games and wins grow", () => {
    expect(capForReliability(7, { games: 10, wins: 6 })).toBeLessThan(5); // cleared L4, not L5
    expect(capForReliability(7, { games: 16, wins: 10 })).toBeLessThan(6); // cleared L5, not L6
    expect(capForReliability(7, { games: 22, wins: 14 })).toBeLessThan(7); // cleared L6, not L7
  });

  it("lets a fully proven record reach the top of the ladder", () => {
    expect(capForReliability(7, { games: 30, wins: 20 })).toBe(7);
  });

  it("never lowers a rating already under the unlocked ceiling", () => {
    expect(capForReliability(3.2, { games: 3, wins: 1 })).toBe(3.2);
  });
});
