import { describe, expect, it } from "vitest";
import type { Archetype } from "./archetype";
import type { MatchHistoryEntry } from "./queries";
import { archetypeDistribution, ppgTrend, ratingBinIndex, ratingHistogram } from "./distribution";

describe("ratingHistogram", () => {
  it("produces 14 half-point bands across 0–7", () => {
    const bins = ratingHistogram([]);
    expect(bins).toHaveLength(14);
    expect(bins[0]).toMatchObject({ min: 0, max: 0.5 });
    expect(bins[13]).toMatchObject({ min: 6.5, max: 7 });
  });

  it("buckets ratings into the right band and carries the band color", () => {
    const bins = ratingHistogram([3.4, 3.6, 6.9]);
    expect(bins[6].count).toBe(1); // 3.4 → [3.0, 3.5)
    expect(bins[7].count).toBe(1); // 3.6 → [3.5, 4.0)
    expect(bins[13].count).toBe(1); // 6.9 → top band
    expect(bins[6].color).toMatch(/^#/);
  });

  it("clamps a perfect 7.0 into the top band", () => {
    expect(ratingBinIndex(7)).toBe(13);
    expect(ratingBinIndex(0)).toBe(0);
  });
});

describe("archetypeDistribution", () => {
  const arch = (label: string, primary: string): Archetype => ({ key: label, primary: primary as Archetype["primary"], label, description: "" });

  it("counts archetypes by label, most common first", () => {
    const slices = archetypeDistribution([
      arch("The Closer", "win"),
      arch("The Closer", "win"),
      arch("The Metronome", "consistency"),
    ]);
    expect(slices[0]).toMatchObject({ label: "The Closer", count: 2 });
    expect(slices[1]).toMatchObject({ label: "The Metronome", count: 1 });
  });
});

describe("ppgTrend", () => {
  function match(eventId: string, playedOn: string | null, points: number, conceded: number): MatchHistoryEntry {
    return {
      matchId: `${eventId}-${points}-${conceded}-${Math.random()}`,
      eventId,
      eventTitle: eventId,
      location: null,
      playedOn,
      round: 1,
      court: 1,
      partner: null,
      partnerId: null,
      opponents: [],
      opponentIds: [],
      points,
      conceded,
      result: points > conceded ? "W" : points < conceded ? "L" : "D",
    };
  }

  it("averages points and diff per event, oldest first", () => {
    const t = ppgTrend([
      match("feb", "2026-02-01", 20, 10),
      match("jan", "2026-01-01", 18, 12),
      match("jan", "2026-01-01", 22, 8),
    ]);
    expect(t.map((p) => p.eventId)).toEqual(["jan", "feb"]);
    expect(t[0].ppg).toBeCloseTo(20); // (18 + 22) / 2
    expect(t[0].diffPg).toBeCloseTo(10); // ((18-12)+(22-8))/2
    expect(t[1].ppg).toBeCloseTo(20);
  });

  it("returns empty for no matches", () => {
    expect(ppgTrend([])).toEqual([]);
  });
});
