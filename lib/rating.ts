import { type FieldStats, type PlayerMetrics, z } from "./stats";

// Performance rating: field-relative blend of win rate, point differential,
// and points-per-game, mapped to Playtomic's 0.0..7.0 level scale (one decimal).
// Playtomic rates padel players from 0 (just started) to 7 (world-tour pro), so
// we cap there too — see https://playtomic.com/blog/padel-levels and
// lib/levels.ts for the band breakdown. Not history-dependent — recomputed from
// the whole field on every read, so a player's number is always relative to the
// current field (mid-field ≈ 3.5, the middle of the ladder).
export const RATING_WEIGHTS = { winRate: 0.4, diffPg: 0.35, ppg: 0.25 } as const;

// Top of the Playtomic ladder. A rating never exceeds this.
export const MAX_RATING = 7;

// Reliability gates for the upper bands. Playtomic doesn't let a player sit at a
// high level on a thin record — it tracks "reliability" (confidence that builds
// as you play more competitive matches) and only trusts a high level once that
// confidence is there, rather than after a fixed match count (researched at
// playerhelp.playtomic.com — "How the Playtomic level system works"). We make
// that concrete with one gate per upper band: to be rated into the level-N band
// a player must clear that band's games-and-wins bar. Until they do, the rating
// is held just below the band — they've earned the bands below, not this one.
// Bars rise together and keep the win rate around 60–67%, so only a genuinely
// dominant, well-tested player reaches the top.
export interface ReliabilityTier {
  level: number; // integer band a player must qualify for to be rated into it
  minGames: number;
  minWins: number;
}

export const RELIABILITY_TIERS: ReliabilityTier[] = [
  { level: 4, minGames: 8, minWins: 5 }, // ~1 event, winning record → Controller (4.x)
  { level: 5, minGames: 14, minWins: 9 }, // ~2 events → Competitor (5.x)
  { level: 6, minGames: 20, minWins: 13 }, // ~3 events → Elite (6.x)
  { level: 7, minGames: 30, minWins: 20 }, // sustained dominance → Professional (7.0)
];

// The career counts the reliability gate needs (a player's own totals).
export interface Reliability {
  games: number;
  wins: number;
}

export interface RatingField {
  winRate: FieldStats;
  diffPg: FieldStats;
  ppg: FieldStats;
}

export function computeRating(
  m: PlayerMetrics,
  field: RatingField,
  reliability: Reliability
): number {
  const blendedZ =
    RATING_WEIGHTS.winRate * z(m.winRate, field.winRate) +
    RATING_WEIGHTS.diffPg * z(m.diffPg, field.diffPg) +
    RATING_WEIGHTS.ppg * z(m.ppg, field.ppg);
  // Re-expand the weighted z (weights sum to 1, which shrinks variance) and
  // squash into 0..1 via tanh, then stretch onto Playtomic's 0.0..7.0 ladder
  // (one decimal). tanh asymptotes below 1, so the cap is a safety net.
  const unit = 0.5 + 0.5 * Math.tanh(blendedZ * 1.6);
  const raw = Math.min(MAX_RATING, Math.round(unit * MAX_RATING * 10) / 10);
  return capForReliability(raw, reliability);
}

// The highest rating a record currently justifies: walk the gates low → high and
// stop just below the first band the player can't yet clear. A fully proven
// record unlocks the whole ladder (MAX_RATING).
export function reliabilityCap({ games, wins }: Reliability): number {
  for (const t of RELIABILITY_TIERS) {
    if (games < t.minGames || wins < t.minWins) {
      return Math.round((t.level - 0.1) * 10) / 10; // top of the last earned band
    }
  }
  return MAX_RATING;
}

// Hold a rating at the highest band the player has earned the reliability for.
// Ratings already under that ceiling pass through untouched.
export function capForReliability(rating: number, reliability: Reliability): number {
  return Math.min(rating, reliabilityCap(reliability));
}

// How much more it takes to clear the next reliability gate. The next gate is the
// first tier the player hasn't fully met; `gamesNeeded`/`winsNeeded` are what's
// still missing (0 once that half of the bar is already cleared). null when every
// gate is cleared — the player can reach the top of the ladder.
export interface NextGate {
  tier: ReliabilityTier;
  gamesNeeded: number;
  winsNeeded: number;
}

export function nextReliabilityGate({ games, wins }: Reliability): NextGate | null {
  for (const t of RELIABILITY_TIERS) {
    if (games < t.minGames || wins < t.minWins) {
      return {
        tier: t,
        gamesNeeded: Math.max(0, t.minGames - games),
        winsNeeded: Math.max(0, t.minWins - wins),
      };
    }
  }
  return null;
}

export const MIN_GAMES_RANKED = 3;

export function isProvisional(games: number): boolean {
  return games < MIN_GAMES_RANKED;
}
