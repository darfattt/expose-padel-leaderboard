import { describe, expect, it } from "vitest";
import { buildPowerCaption, buildPowerRankings, buildPowerRankingsCard } from "./power-rankings";
import type { RankedPlayerWithChange } from "./standings";

// Minimal stand-ins — buildPowerRankings only reads rank, rankDelta, isNew,
// rating and a few row fields.
function p(
  id: string,
  rank: number | null,
  rankDelta: number | null,
  isNew: boolean,
  rating = 3.5,
  wins = 5,
  losses = 5
): RankedPlayerWithChange {
  return {
    rank,
    rankDelta,
    isNew,
    rating,
    row: { player_id: id, name: id.toUpperCase(), wins, losses },
  } as unknown as RankedPlayerWithChange;
}

describe("buildPowerRankings", () => {
  const board = [
    p("a", 1, 2, false, 5.1),
    p("b", 2, -1, false, 4.8),
    p("c", 3, 4, false, 4.2), // biggest climber
    p("d", 4, null, true, 3.9), // newcomer
    p("e", 5, -3, false, 3.5), // biggest faller
    p("f", null, null, false), // provisional — ignored
  ];

  it("ranks leaders by current position", () => {
    const pr = buildPowerRankings(board);
    expect(pr.leaders.map((m) => m.id)).toEqual(["a", "b", "c"]);
  });

  it("orders climbers by largest upward move and excludes newcomers", () => {
    const pr = buildPowerRankings(board);
    expect(pr.climbers[0].id).toBe("c"); // +4
    expect(pr.climbers.map((m) => m.id)).not.toContain("d");
  });

  it("orders fallers by largest downward move", () => {
    const pr = buildPowerRankings(board);
    expect(pr.fallers[0].id).toBe("e"); // -3
  });

  it("collects newly ranked players", () => {
    const pr = buildPowerRankings(board);
    expect(pr.newcomers.map((m) => m.id)).toEqual(["d"]);
  });

  it("builds a card and caption from the movers", () => {
    const pr = buildPowerRankings(board);
    const input = { scopeLabel: "Expose Padel", headline: "Cs on the charge" };
    const spec = buildPowerRankingsCard(pr, input);
    expect(spec.kicker).toBe("Power Rankings");
    expect(spec.rows && spec.rows.length).toBeGreaterThan(0);

    const caption = buildPowerCaption(pr, input, "C surged four spots.");
    expect(caption).toContain("C surged four spots.");
    expect(caption).toContain("#1 A");
  });
});
