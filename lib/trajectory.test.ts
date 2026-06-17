import { describe, expect, it } from "vitest";
import { type RawResult } from "./standings";
import { buildRankTrajectory } from "./trajectory";

// A player's games in one event, all the same score line, enough to clear the
// provisional threshold (3 games) so they actually get ranked.
function games(playerId: string, eventId: string, playedOn: string, n: number, points: number, conceded: number): RawResult[] {
  return Array.from({ length: n }, () => ({
    playerId,
    name: playerId,
    points,
    conceded,
    won: points > conceded,
    isDraw: points === conceded,
    eventId,
    playedOn,
  }));
}

describe("buildRankTrajectory", () => {
  it("returns empty when there are no dated results", () => {
    const undated = games("a", "e1", "", 4, 21, 10).map((r) => ({ ...r, playedOn: null }));
    expect(buildRankTrajectory(undated)).toEqual({ months: [], series: [] });
  });

  it("orders months ascending and tracks cumulative rank per month", () => {
    const results = [
      ...games("a", "e1", "2026-01-10", 8, 21, 19), // Jan: a wins every game
      ...games("b", "e1", "2026-01-10", 8, 19, 21), // Jan: b loses every game
      ...games("b", "e2", "2026-02-10", 12, 21, 3), // Feb: b piles up net points + wins
      ...games("a", "e2", "2026-02-10", 4, 3, 21), //  Feb: a collapses, bleeding net points
    ];
    const t = buildRankTrajectory(results);
    expect(t.months).toEqual(["2026-01", "2026-02"]);

    const a = t.series.find((s) => s.id === "a")!;
    const b = t.series.find((s) => s.id === "b")!;
    // Jan: a is ahead on its perfect record.
    expect(a.points[0].rank).toBe(1);
    expect(b.points[0].rank).toBe(2);
    // Feb is cumulative — b clears the reliability gates a falls behind on and
    // takes over the top of the board.
    expect(b.points[1].rank).toBe(1);
    expect(a.points[1].rank).toBe(2);
  });

  it("sorts series by final rank with provisional players last", () => {
    const results = [
      ...games("a", "e1", "2026-01-10", 4, 21, 5),
      ...games("b", "e1", "2026-01-10", 4, 15, 18),
      // c plays only one game — stays provisional (rank null).
      { playerId: "c", name: "c", points: 21, conceded: 0, won: true, isDraw: false, eventId: "e1", playedOn: "2026-01-10" },
    ];
    const t = buildRankTrajectory(results);
    expect(t.series.map((s) => s.id)).toEqual(["a", "b", "c"]);
    expect(t.series[2].finalRank).toBeNull();
  });
});
