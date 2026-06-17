import { describe, expect, it } from "vitest";
import { computeEventAwards } from "./awards";
import type { EventPlayerResult } from "./queries";
import type { CareerStatRow } from "./types";

let seq = 0;

// Build the 4 rows for one doubles match. team1/team2 are [id, name] pairs.
function doublesMatch(
  team1: [string, string][],
  team1Score: number,
  team2: [string, string][],
  team2Score: number
): EventPlayerResult[] {
  seq += 1;
  const matchId = `m${seq}`;
  const t1Won = team1Score > team2Score;
  const draw = team1Score === team2Score;
  const side = (team: [string, string][], score: number, conceded: number, won: boolean, teamNo: number) =>
    team.map(([playerId, name]) => ({
      matchId,
      round: 1,
      court: 1,
      team: teamNo,
      playerId,
      name,
      points: score,
      conceded,
      won,
      isDraw: draw,
    }));
  return [
    ...side(team1, team1Score, team2Score, t1Won, 1),
    ...side(team2, team2Score, team1Score, !t1Won && !draw, 2),
  ];
}

function career(playerId: string, partial: Partial<CareerStatRow> = {}): CareerStatRow {
  return {
    player_id: playerId,
    name: playerId,
    games: 10,
    wins: 5,
    losses: 5,
    draws: 0,
    points_for: 200,
    points_against: 200,
    point_diff: 0,
    close_games: 0,
    close_wins: 0,
    score_variance: 0,
    ...partial,
  };
}

describe("computeEventAwards — MVP", () => {
  it("awards the best total point differential", () => {
    const rows = [
      ...doublesMatch([["a", "Ann"], ["b", "Bob"]], 21, [["c", "Cid"], ["d", "Dee"]], 10),
      ...doublesMatch([["a", "Ann"], ["c", "Cid"]], 21, [["b", "Bob"], ["d", "Dee"]], 19),
    ];
    const { mvp } = computeEventAwards(rows);
    // Ann: (+11) + (+2) = +13, the best.
    expect(mvp?.playerIds).toEqual(["a"]);
    expect(mvp?.detail).toContain("+13");
  });

  it("is null with no players", () => {
    expect(computeEventAwards([]).mvp).toBeNull();
  });
});

describe("computeEventAwards — best partnership", () => {
  it("picks the duo with the largest combined point diff", () => {
    const rows = [
      ...doublesMatch([["a", "Ann"], ["b", "Bob"]], 21, [["c", "Cid"], ["d", "Dee"]], 5),
      ...doublesMatch([["a", "Ann"], ["c", "Cid"]], 21, [["b", "Bob"], ["d", "Dee"]], 20),
    ];
    const { bestPartnership } = computeEventAwards(rows);
    expect(bestPartnership?.playerIds.sort()).toEqual(["a", "b"]);
    expect(bestPartnership?.detail).toContain("+16");
  });

  it("aggregates a pair that plays together more than once", () => {
    const rows = [
      ...doublesMatch([["a", "Ann"], ["b", "Bob"]], 21, [["c", "Cid"], ["d", "Dee"]], 18),
      ...doublesMatch([["a", "Ann"], ["b", "Bob"]], 21, [["c", "Cid"], ["d", "Dee"]], 17),
    ];
    const { bestPartnership } = computeEventAwards(rows);
    expect(bestPartnership?.playerIds.sort()).toEqual(["a", "b"]);
    // +3 and +4 across two games => "2–0" record shown.
    expect(bestPartnership?.detail).toContain("2–0");
  });
});

describe("computeEventAwards — biggest upset", () => {
  it("finds the lowest-rated winners over higher-rated opponents", () => {
    const rows = doublesMatch([["a", "Ann"], ["b", "Bob"]], 21, [["c", "Cid"], ["d", "Dee"]], 19);
    const ratingById = new Map([
      ["a", 4.0],
      ["b", 4.0],
      ["c", 8.0],
      ["d", 8.0],
    ]);
    const { biggestUpset } = computeEventAwards(rows, { ratingById });
    expect(biggestUpset?.playerIds.sort()).toEqual(["a", "b"]);
    expect(biggestUpset?.detail).toContain("+4.0 rating gap");
  });

  it("is null when the favourites win (no upset)", () => {
    const rows = doublesMatch([["c", "Cid"], ["d", "Dee"]], 21, [["a", "Ann"], ["b", "Bob"]], 10);
    const ratingById = new Map([
      ["a", 4.0],
      ["b", 4.0],
      ["c", 8.0],
      ["d", 8.0],
    ]);
    expect(computeEventAwards(rows, { ratingById }).biggestUpset).toBeNull();
  });

  it("is null without ratings", () => {
    const rows = doublesMatch([["a", "Ann"], ["b", "Bob"]], 21, [["c", "Cid"], ["d", "Dee"]], 19);
    expect(computeEventAwards(rows).biggestUpset).toBeNull();
  });
});

describe("computeEventAwards — most improved", () => {
  it("rewards the night most above a player's usual point diff", () => {
    const rows = doublesMatch([["a", "Ann"], ["b", "Bob"]], 21, [["c", "Cid"], ["d", "Dee"]], 1);
    // Ann scored +20 this event; her career (incl. this event) is +20 over 11
    // games, so baseline over the other 10 is 0/game — a big jump.
    const careerById = new Map([["a", career("a", { games: 11, point_diff: 20 })]]);
    const { mostImproved } = computeEventAwards(rows, { careerById });
    expect(mostImproved?.playerIds).toEqual(["a"]);
  });

  it("ignores players without enough baseline games", () => {
    const rows = doublesMatch([["a", "Ann"], ["b", "Bob"]], 21, [["c", "Cid"], ["d", "Dee"]], 1);
    // Career is just this one event — no baseline to improve on.
    const careerById = new Map([["a", career("a", { games: 1, point_diff: 20 })]]);
    expect(computeEventAwards(rows, { careerById }).mostImproved).toBeNull();
  });
});
