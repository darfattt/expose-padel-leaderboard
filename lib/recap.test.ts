import { describe, expect, it } from "vitest";
import type { EventAwards } from "./awards";
import { buildEventRecap, buildRecapCaption } from "./recap";

const event = { title: "Friday Mexicano", playedOn: "2026-06-19", location: "Expose Padel" };

function awards(partial: Partial<EventAwards> = {}): EventAwards {
  return {
    mvp: { playerIds: ["a"], names: ["Ann"], detail: "+13 pt diff · 2–0" },
    bestPartnership: null,
    biggestUpset: null,
    mostImproved: null,
    demolition: null,
    heartbreak: null,
    ...partial,
  };
}

describe("buildEventRecap", () => {
  it("emits one row per award that has a winner", () => {
    const spec = buildEventRecap(event, awards());
    expect(spec.rows).toHaveLength(1);
    expect(spec.rows?.[0].title).toContain("Ann");
    expect(spec.kicker).toBe("Match Night");
    expect(spec.title).toBe("Friday Mexicano");
  });

  it("falls back to the stat line, and a quip overrides it", () => {
    const plain = buildEventRecap(event, awards());
    expect(plain.rows?.[0].subtitle).toBe("+13 pt diff · 2–0");

    const witty = buildEventRecap(event, awards(), { mvp: "Ann ran the table." });
    expect(witty.rows?.[0].subtitle).toBe("Ann ran the table.");
  });

  it("uses the event meta line as a default headline", () => {
    expect(buildEventRecap(event, awards()).headline).toBe("2026-06-19 · Expose Padel");
    expect(buildEventRecap(event, awards(), {}, "What a night").headline).toBe("What a night");
  });
});

describe("buildRecapCaption", () => {
  it("lists each present award with its line", () => {
    const caption = buildRecapCaption(event, awards(), { mvp: "Ann ran the table." });
    expect(caption).toContain("🏅 MVP: Ann — Ann ran the table.");
    expect(caption).toContain("expose.padel-leaderboard");
  });
});
