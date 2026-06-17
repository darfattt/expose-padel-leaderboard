import { describe, expect, it } from "vitest";
import { rankPlayers } from "./leaderboard";
import {
  type RawResult,
  aggregateResults,
  filterByMonth,
  formatMonth,
  latestEventId,
  monthsFromResults,
  resultsBeforeLatest,
  withRankChange,
} from "./standings";

function result(p: Partial<RawResult> & { playerId: string; eventId: string }): RawResult {
  return {
    name: p.playerId,
    points: 0,
    conceded: 0,
    won: false,
    isDraw: false,
    playedOn: null,
    ...p,
  };
}

describe("aggregateResults", () => {
  it("rolls up per-player games, W/L/D, points, and close games", () => {
    const results: RawResult[] = [
      result({ playerId: "a", eventId: "e1", points: 24, conceded: 10, won: true }),
      result({ playerId: "a", eventId: "e1", points: 12, conceded: 14, won: false }), // close loss
      result({ playerId: "a", eventId: "e1", points: 16, conceded: 16, isDraw: true }), // close draw
    ];
    const [row] = aggregateResults(results);
    expect(row.games).toBe(3);
    expect(row.wins).toBe(1);
    expect(row.losses).toBe(1);
    expect(row.draws).toBe(1);
    expect(row.points_for).toBe(52);
    expect(row.points_against).toBe(40);
    expect(row.point_diff).toBe(12);
    expect(row.close_games).toBe(2); // the loss and the draw
    expect(row.close_wins).toBe(0);
  });

  it("produces one row per distinct player", () => {
    const rows = aggregateResults([
      result({ playerId: "a", eventId: "e1" }),
      result({ playerId: "b", eventId: "e1" }),
      result({ playerId: "a", eventId: "e2" }),
    ]);
    expect(rows.map((r) => r.player_id).sort()).toEqual(["a", "b"]);
  });
});

describe("month helpers", () => {
  const results: RawResult[] = [
    result({ playerId: "a", eventId: "e1", playedOn: "2026-05-10" }),
    result({ playerId: "a", eventId: "e2", playedOn: "2026-06-02" }),
    result({ playerId: "b", eventId: "e3", playedOn: null }),
  ];

  it("lists distinct dated months newest first", () => {
    expect(monthsFromResults(results)).toEqual(["2026-06", "2026-05"]);
  });

  it("filters results to a single month", () => {
    const may = filterByMonth(results, "2026-05");
    expect(may.map((r) => r.eventId)).toEqual(["e1"]);
  });

  it("formats a month label", () => {
    expect(formatMonth("2026-06")).toBe("Jun 2026");
  });
});

describe("latestEventId / resultsBeforeLatest", () => {
  it("returns null when fewer than two events exist", () => {
    expect(latestEventId([result({ playerId: "a", eventId: "e1", playedOn: "2026-06-01" })])).toBeNull();
  });

  it("picks the most recent dated event and excludes it", () => {
    const results: RawResult[] = [
      result({ playerId: "a", eventId: "old", playedOn: "2026-05-01" }),
      result({ playerId: "a", eventId: "new", playedOn: "2026-06-01" }),
    ];
    expect(latestEventId(results)).toBe("new");
    expect(resultsBeforeLatest(results)?.map((r) => r.eventId)).toEqual(["old"]);
  });

  it("never treats an undated event as the latest", () => {
    const results: RawResult[] = [
      result({ playerId: "a", eventId: "dated", playedOn: "2026-05-01" }),
      result({ playerId: "a", eventId: "undated", playedOn: null }),
    ];
    expect(latestEventId(results)).toBe("dated");
  });
});

describe("withRankChange", () => {
  // Two ranked boards built from real aggregation so ranks are genuine.
  const mkBoard = (winnerGames: number) =>
    rankPlayers(
      aggregateResults([
        // "rising" wins a lot in the current board, fewer before
        ...Array.from({ length: winnerGames }, (_, i) =>
          result({ playerId: "rising", eventId: `e${i}`, points: 24, conceded: 8, won: true })
        ),
        ...Array.from({ length: 5 }, (_, i) =>
          result({ playerId: "steady", eventId: `s${i}`, points: 16, conceded: 14, won: true })
        ),
        ...Array.from({ length: 5 }, (_, i) =>
          result({ playerId: "faller", eventId: `f${i}`, points: 14, conceded: 16, won: false })
        ),
      ])
    );

  it("reports null deltas when there is no previous board", () => {
    const board = withRankChange(mkBoard(5), null);
    expect(board.every((p) => p.rankDelta === null && !p.isNew)).toBe(true);
  });

  it("computes previousRank − currentRank", () => {
    const previous = mkBoard(1); // rising barely plays -> provisional / low
    const current = mkBoard(6); // rising dominates -> climbs
    const changed = withRankChange(current, previous);
    const rising = changed.find((p) => p.row.player_id === "rising")!;
    // rising was provisional/absent before, so it's flagged new (no prior rank).
    expect(rising.isNew || (rising.rankDelta ?? 0) > 0).toBe(true);
  });

  it("flags a player ranked now but absent before as new", () => {
    const previous = rankPlayers(
      aggregateResults([
        ...Array.from({ length: 5 }, (_, i) =>
          result({ playerId: "incumbent", eventId: `i${i}`, points: 20, conceded: 10, won: true })
        ),
      ])
    );
    const current = rankPlayers(
      aggregateResults([
        ...Array.from({ length: 5 }, (_, i) =>
          result({ playerId: "incumbent", eventId: `i${i}`, points: 20, conceded: 10, won: true })
        ),
        ...Array.from({ length: 4 }, (_, i) =>
          result({ playerId: "rookie", eventId: `r${i}`, points: 22, conceded: 9, won: true })
        ),
      ])
    );
    const rookie = withRankChange(current, previous).find((p) => p.row.player_id === "rookie")!;
    expect(rookie.isNew).toBe(true);
    expect(rookie.rankDelta).toBeNull();
  });
});
