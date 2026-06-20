import { describe, expect, it } from "vitest";
import type { RankedPlayer } from "./leaderboard";
import type { MatchHistoryEntry } from "./queries";
import type { CareerStatRow } from "./types";
import { buildWrapped, type WrappedInput } from "./wrapped";

function careerRow(partial: Partial<CareerStatRow> = {}): CareerStatRow {
  return {
    player_id: "p1",
    name: "Pat",
    games: 12,
    wins: 8,
    losses: 4,
    draws: 0,
    points_for: 240,
    points_against: 180,
    point_diff: 60,
    close_games: 4,
    close_wins: 3,
    score_variance: 10,
    ...partial,
  };
}

function player(): RankedPlayer {
  return {
    rank: 3,
    rating: 4.6,
    provisional: false,
    row: careerRow(),
    attributes: { attack: 80, defense: 50, consistency: 60, clutch: 70, win: 75 },
    archetype: { key: "attacker", primary: "attack", label: "The Hammer", description: "Big finisher." },
  } as unknown as RankedPlayer;
}

// One partner match — partnerChemistry needs a few before it surfaces a "best".
function match(i: number, partnerId: string, partner: string, result: "W" | "L"): MatchHistoryEntry {
  return {
    matchId: `m${i}`,
    eventId: "e1",
    eventTitle: "Night",
    location: "Court",
    playedOn: "2026-06-10",
    round: 1,
    court: 1,
    partner,
    partnerId,
    opponents: ["Cid", "Dee"],
    opponentIds: ["c", "d"],
    points: result === "W" ? 21 : 15,
    conceded: result === "W" ? 12 : 21,
    result,
  } as MatchHistoryEntry;
}

describe("buildWrapped", () => {
  const base: WrappedInput = {
    player: player(),
    matches: [1, 2, 3, 4].map((i) => match(i, "b", "Bob", "W")),
    careerRow: careerRow(),
    gender: "male",
    periodLabel: "all time",
  };

  it("always includes level and style panels and a rating hero", () => {
    const w = buildWrapped(base);
    const keys = w.panels.map((p) => p.key);
    expect(keys).toContain("level");
    expect(keys).toContain("style");
    expect(w.card.hero?.value).toBe("4.6/7");
    expect(w.card.kicker).toBe("Padel Wrapped");
  });

  it("surfaces a top partner from repeated pairings", () => {
    const w = buildWrapped(base);
    const partner = w.panels.find((p) => p.key === "partner");
    expect(partner?.headline).toBe("Bob");
  });

  it("includes the LLM intro panel and uses its headline on the card when supplied", () => {
    const w = buildWrapped({ ...base, intro: { headline: "Year of the Hammer", blurb: "Pat smashed it." } });
    expect(w.panels[0].key).toBe("intro");
    expect(w.card.headline).toBe("Year of the Hammer");
  });

  it("builds a shareable caption", () => {
    const w = buildWrapped(base);
    expect(w.caption).toContain("Pat's Padel Wrapped");
    expect(w.caption).toContain("expose.padel-leaderboard");
  });
});
