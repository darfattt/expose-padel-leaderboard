import { describe, expect, it } from "vitest";
import type { MatchHistoryEntry } from "./queries";
import {
  bestVenue,
  computeForm,
  headToHead,
  opponentRecords,
  partnerChemistry,
  relationshipSummary,
  rivalries,
} from "./relationships";

let seq = 0;
// Builds a match from one player's perspective. Defaults to a solo dated game
// with no partner/opponents; override what each test cares about.
function match(p: Partial<MatchHistoryEntry> = {}): MatchHistoryEntry {
  seq += 1;
  return {
    matchId: `m${seq}`,
    eventId: `e${seq}`,
    eventTitle: "Event",
    location: null,
    playedOn: "2024-01-01",
    round: 1,
    court: 1,
    partner: null,
    partnerId: null,
    opponents: [],
    opponentIds: [],
    points: 21,
    conceded: 10,
    result: "W",
    ...p,
  };
}

// Convenience: a game partnered with `id`, used to build a partner record.
function withPartner(id: string, name: string, result: "W" | "L" | "D"): MatchHistoryEntry {
  return match({ partnerId: id, partner: name, result });
}

// Convenience: a game against a single opponent `id`.
function vsOpponent(
  id: string,
  name: string,
  result: "W" | "L" | "D",
  extra: Partial<MatchHistoryEntry> = {}
): MatchHistoryEntry {
  return match({ opponentIds: [id], opponents: [name], result, ...extra });
}

describe("partnerChemistry", () => {
  it("aggregates a record per partner and lists most games first", () => {
    const { partners } = partnerChemistry([
      withPartner("a", "Ann", "W"),
      withPartner("a", "Ann", "L"),
      withPartner("b", "Bob", "W"),
    ]);
    expect(partners.map((p) => p.id)).toEqual(["a", "b"]);
    const ann = partners.find((p) => p.id === "a")!;
    expect(ann).toMatchObject({ games: 2, wins: 1, losses: 1, winRate: 0.5 });
  });

  it("skips games with no partner", () => {
    const { partners } = partnerChemistry([match({ partnerId: null }), withPartner("a", "Ann", "W")]);
    expect(partners).toHaveLength(1);
  });

  it("picks best/worst only among partners over the shared-games threshold", () => {
    // Ann: 3 games all won (eligible). Bob: 3 games all lost (eligible).
    // Cy: 1 game won — a perfect record but below threshold, so never a superlative.
    const matches = [
      ...Array(3).fill(0).map(() => withPartner("a", "Ann", "W")),
      ...Array(3).fill(0).map(() => withPartner("b", "Bob", "L")),
      withPartner("c", "Cy", "W"),
    ];
    const { partners, best, worst } = partnerChemistry(matches);
    expect(partners).toHaveLength(3); // full table still lists Cy
    expect(best?.id).toBe("a");
    expect(worst?.id).toBe("b");
  });

  it("returns no worst when only one partner is eligible", () => {
    const { best, worst } = partnerChemistry([
      ...Array(3).fill(0).map(() => withPartner("a", "Ann", "W")),
      withPartner("c", "Cy", "L"), // below threshold
    ]);
    expect(best?.id).toBe("a");
    expect(worst).toBeNull();
  });

  it("groups by id even when two partners share a display name", () => {
    const { partners } = partnerChemistry([
      withPartner("a", "Alex", "W"),
      withPartner("b", "Alex", "L"),
    ]);
    expect(partners).toHaveLength(2);
  });

  it("handles empty history", () => {
    expect(partnerChemistry([])).toEqual({ partners: [], best: null, worst: null });
  });
});

describe("opponentRecords", () => {
  it("counts a game against every opponent on the other team", () => {
    const recs = opponentRecords([
      match({ opponentIds: ["x", "y"], opponents: ["Xena", "Yan"], result: "L" }),
    ]);
    expect(recs.map((r) => r.id).sort()).toEqual(["x", "y"]);
    expect(recs.every((r) => r.games === 1 && r.losses === 1)).toBe(true);
  });
});

describe("rivalries", () => {
  it("names the nemesis (losing record) and favourite victim (winning record)", () => {
    const matches = [
      // vs Nat: lost all 3 → nemesis
      ...Array(3).fill(0).map(() => vsOpponent("nat", "Nat", "L")),
      // vs Vic: won all 3 → favourite victim
      ...Array(3).fill(0).map(() => vsOpponent("vic", "Vic", "W")),
    ];
    const { nemesis, favoriteVictim } = rivalries(matches);
    expect(nemesis?.id).toBe("nat");
    expect(favoriteVictim?.id).toBe("vic");
  });

  it("ignores opponents below the shared-games threshold", () => {
    const { nemesis } = rivalries([vsOpponent("nat", "Nat", "L"), vsOpponent("nat", "Nat", "L")]);
    expect(nemesis).toBeNull(); // only 2 games
  });

  it("leaves nemesis/victim null when no record is decisively winning or losing", () => {
    const matches = [
      vsOpponent("e", "Evan", "W"),
      vsOpponent("e", "Evan", "L"),
      vsOpponent("e", "Evan", "D"),
    ];
    const { nemesis, favoriteVictim } = rivalries(matches);
    expect(nemesis).toBeNull();
    expect(favoriteVictim).toBeNull();
  });
});

describe("computeForm", () => {
  it("returns the most recent results first, respecting round order within an event", () => {
    // Same event/date, rounds 1..3. Source order is round-ascending; the most
    // recent game is round 3 (a loss), not round 1.
    const matches = [
      match({ eventId: "e", playedOn: "2024-05-01", round: 1, result: "W" }),
      match({ eventId: "e", playedOn: "2024-05-01", round: 2, result: "W" }),
      match({ eventId: "e", playedOn: "2024-05-01", round: 3, result: "L" }),
    ];
    const { recent, currentStreak } = computeForm(matches);
    expect(recent).toEqual(["L", "W", "W"]);
    expect(currentStreak).toEqual({ result: "L", length: 1 });
  });

  it("orders across events by date, newest first", () => {
    const matches = [
      match({ eventId: "old", playedOn: "2024-01-01", result: "L" }),
      match({ eventId: "new", playedOn: "2024-03-01", result: "W" }),
    ];
    expect(computeForm(matches).recent).toEqual(["W", "L"]);
  });

  it("caps recent at the form window", () => {
    const matches = Array(8)
      .fill(0)
      .map((_, i) => match({ playedOn: `2024-01-0${i + 1}`, result: "W" }));
    expect(computeForm(matches).recent).toHaveLength(5);
  });

  it("breaks the win streak on a draw", () => {
    // Chronological: W, W, D, W, W (newest last). Longest win run is 2.
    const matches = [
      match({ playedOn: "2024-01-01", result: "W" }),
      match({ playedOn: "2024-01-02", result: "W" }),
      match({ playedOn: "2024-01-03", result: "D" }),
      match({ playedOn: "2024-01-04", result: "W" }),
      match({ playedOn: "2024-01-05", result: "W" }),
    ];
    const form = computeForm(matches);
    expect(form.longestWinStreak).toBe(2);
    expect(form.currentStreak).toEqual({ result: "W", length: 2 }); // last two are wins
  });

  it("handles empty history", () => {
    expect(computeForm([])).toEqual({ recent: [], currentStreak: null, longestWinStreak: 0 });
  });
});

describe("bestVenue", () => {
  it("picks the eligible venue with the highest win rate", () => {
    const matches = [
      ...Array(3).fill(0).map(() => match({ location: "Court A", result: "W" })),
      ...Array(3).fill(0).map(() => match({ location: "Court B", result: "L" })),
      match({ location: "Court C", result: "W" }), // below threshold
    ];
    expect(bestVenue(matches)?.name).toBe("Court A");
  });

  it("ignores games with no location and returns null when none qualify", () => {
    expect(bestVenue([match({ location: null, result: "W" })])).toBeNull();
  });
});

describe("relationshipSummary", () => {
  it("summarises best partner, nemesis, and form in grounded text", () => {
    const matches = [
      ...Array(3).fill(0).map(() => withPartner("a", "Ann", "W")),
      ...Array(3).fill(0).map((_, i) => vsOpponent("nat", "Nat", "L", { playedOn: `2024-02-0${i + 1}` })),
    ];
    const summary = relationshipSummary(matches);
    expect(summary).toContain("Best partner: Ann");
    expect(summary).toContain("Nemesis: Nat");
    expect(summary).toContain("Form (newest first)");
  });

  it("falls back to a clear note when there's not enough data", () => {
    expect(relationshipSummary([])).toContain("not enough games");
  });
});

describe("headToHead", () => {
  const matches = [
    vsOpponent("rival", "Rival", "W", { playedOn: "2024-01-01", points: 21, conceded: 15 }),
    vsOpponent("rival", "Rival", "L", { playedOn: "2024-02-01", points: 10, conceded: 21 }),
    vsOpponent("other", "Other", "W", { playedOn: "2024-03-01" }),
  ];

  it("aggregates the record against one opponent and sorts shared games newest first", () => {
    const { record, games } = headToHead(matches, "rival");
    expect(record).toMatchObject({ id: "rival", name: "Rival", games: 2, wins: 1, losses: 1 });
    expect(record.pointDiff).toBe(21 + 10 - 15 - 21); // -5
    expect(games.map((g) => g.playedOn)).toEqual(["2024-02-01", "2024-01-01"]);
  });

  it("returns an empty record for an opponent never faced", () => {
    const { record, games } = headToHead(matches, "ghost");
    expect(record.games).toBe(0);
    expect(games).toEqual([]);
  });
});
