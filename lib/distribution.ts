import type { Archetype } from "./archetype";
import { levelForRating } from "./levels";
import type { MatchHistoryEntry } from "./queries";

// Aggregations that feed the league-trend charts (/trends) and the per-player
// sparklines. All pure — derived on read from already-computed values.

// --- rating distribution ----------------------------------------------------

export interface RatingBin {
  min: number; // inclusive lower bound on the 0–7 scale
  max: number; // exclusive upper bound (the top band is closed)
  label: string; // the level-band category this bin maps to
  color: string; // the band accent (matches the level chips elsewhere)
  count: number;
}

// One bin per 0.5 of rating — the same 14 bands as the level ladder, so the
// histogram reads as "how many players sit in each named band".
export function ratingHistogram(ratings: number[]): RatingBin[] {
  const bins: RatingBin[] = [];
  for (let i = 0; i < 14; i++) {
    const min = i * 0.5;
    const band = levelForRating(min + 0.25); // mid-band lookup
    bins.push({ min, max: min + 0.5, label: band.category, color: band.color, count: 0 });
  }
  for (const r of ratings) bins[ratingBinIndex(r)].count += 1;
  return bins;
}

// Which histogram bin a rating lands in (0..13). Clamped so 7.0 lands in the top
// band rather than spilling past the end.
export function ratingBinIndex(rating: number): number {
  return Math.min(13, Math.max(0, Math.floor(rating / 0.5)));
}

// --- archetype distribution --------------------------------------------------

export interface ArchetypeSlice {
  label: string;
  primary: string; // dominant axis, drives slice coloring
  count: number;
}

export function archetypeDistribution(archetypes: Archetype[]): ArchetypeSlice[] {
  const byLabel = new Map<string, ArchetypeSlice>();
  for (const a of archetypes) {
    const s = byLabel.get(a.label) ?? { label: a.label, primary: a.primary, count: 0 };
    s.count += 1;
    byLabel.set(a.label, s);
  }
  return [...byLabel.values()].sort((x, y) => y.count - x.count || x.label.localeCompare(y.label));
}

// --- points-per-game trend ---------------------------------------------------

export interface PpgPoint {
  eventId: string;
  eventTitle: string;
  playedOn: string | null;
  ppg: number; // average points scored per game in that event
  diffPg: number; // average point differential per game in that event
}

// Per-event scoring form, oldest first. Events are ordered chronologically (dated
// ascending, undated last in first-seen order) — the same ordering the rating
// history uses, so the two read consistently.
export function ppgTrend(matches: MatchHistoryEntry[]): PpgPoint[] {
  if (!matches.length) return [];

  const order: string[] = [];
  const byEvent = new Map<
    string,
    { title: string; playedOn: string | null; games: MatchHistoryEntry[] }
  >();
  for (const m of matches) {
    let g = byEvent.get(m.eventId);
    if (!g) {
      g = { title: m.eventTitle, playedOn: m.playedOn, games: [] };
      byEvent.set(m.eventId, g);
      order.push(m.eventId);
    }
    g.games.push(m);
  }

  const events = [...byEvent.entries()].sort(([aId, a], [bId, b]) => {
    if (a.playedOn && b.playedOn) return a.playedOn.localeCompare(b.playedOn);
    if (a.playedOn) return -1;
    if (b.playedOn) return 1;
    return order.indexOf(aId) - order.indexOf(bId);
  });

  return events.map(([eventId, ev]) => {
    const n = ev.games.length;
    const points = ev.games.reduce((a, g) => a + g.points, 0);
    const conceded = ev.games.reduce((a, g) => a + g.conceded, 0);
    return {
      eventId,
      eventTitle: ev.title,
      playedOn: ev.playedOn,
      ppg: points / n,
      diffPg: (points - conceded) / n,
    };
  });
}
