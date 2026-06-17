import { describe, expect, it } from "vitest";
import { type ParticipantRow, buildH2HMatrix, h2hCell } from "./h2h-matrix";

// One doubles game: team 1 (a, b) beats team 2 (c, d), 21–15.
function doublesGame(matchId: string, winners: [string, string], losers: [string, string], ptsW = 21, ptsL = 15): ParticipantRow[] {
  return [
    { matchId, team: 1, playerId: winners[0], name: winners[0], won: true, isDraw: false, points: ptsW, conceded: ptsL },
    { matchId, team: 1, playerId: winners[1], name: winners[1], won: true, isDraw: false, points: ptsW, conceded: ptsL },
    { matchId, team: 2, playerId: losers[0], name: losers[0], won: false, isDraw: false, points: ptsL, conceded: ptsW },
    { matchId, team: 2, playerId: losers[1], name: losers[1], won: false, isDraw: false, points: ptsL, conceded: ptsW },
  ];
}

describe("buildH2HMatrix", () => {
  it("counts a meeting against each opponent on the far team, not teammates", () => {
    const m = buildH2HMatrix(doublesGame("m1", ["a", "b"], ["c", "d"]));
    // a met c and d (won both), never met teammate b.
    expect(h2hCell(m, "a", "c")).toMatchObject({ games: 1, wins: 1, losses: 0, pointDiff: 6 });
    expect(h2hCell(m, "a", "d")).toMatchObject({ games: 1, wins: 1 });
    expect(h2hCell(m, "a", "b")).toBeNull();
  });

  it("is antisymmetric: a beating b means b lost to a", () => {
    const m = buildH2HMatrix(doublesGame("m1", ["a", "b"], ["c", "d"]));
    expect(h2hCell(m, "a", "c")).toMatchObject({ wins: 1, losses: 0 });
    expect(h2hCell(m, "c", "a")).toMatchObject({ wins: 0, losses: 1, pointDiff: -6 });
  });

  it("accumulates repeated meetings and computes win rate", () => {
    const rows = [
      ...doublesGame("m1", ["a", "b"], ["c", "d"]),
      ...doublesGame("m2", ["c", "d"], ["a", "b"]), // rematch, c/d win
    ];
    const m = buildH2HMatrix(rows);
    const ac = h2hCell(m, "a", "c")!;
    expect(ac).toMatchObject({ games: 2, wins: 1, losses: 1 });
    expect(ac.winRate).toBeCloseTo(0.5);
  });

  it("handles draws as non-wins", () => {
    const rows = doublesGame("m1", ["a", "b"], ["c", "d"]).map((r) => ({ ...r, won: false, isDraw: true, points: 18, conceded: 18 }));
    const m = buildH2HMatrix(rows);
    expect(h2hCell(m, "a", "c")).toMatchObject({ games: 1, wins: 0, draws: 1, winRate: 0, pointDiff: 0 });
  });

  it("lists every player who recorded a meeting", () => {
    const m = buildH2HMatrix(doublesGame("m1", ["a", "b"], ["c", "d"]));
    expect(new Set(m.ids)).toEqual(new Set(["a", "b", "c", "d"]));
  });
});
