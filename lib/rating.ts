import { type FieldStats, type PlayerMetrics, z } from "./stats";

// Performance rating: field-relative blend of win rate, point differential,
// and points-per-game, mapped to a 0.0..10.0 Playtomic-style scale (one
// decimal). Not history-dependent — recomputed from the whole field on every
// read. See lib/levels.ts for how a rating maps to a level category + badge.
export const RATING_WEIGHTS = { winRate: 0.4, diffPg: 0.35, ppg: 0.25 } as const;

export interface RatingField {
  winRate: FieldStats;
  diffPg: FieldStats;
  ppg: FieldStats;
}

export function computeRating(m: PlayerMetrics, field: RatingField): number {
  const blendedZ =
    RATING_WEIGHTS.winRate * z(m.winRate, field.winRate) +
    RATING_WEIGHTS.diffPg * z(m.diffPg, field.diffPg) +
    RATING_WEIGHTS.ppg * z(m.ppg, field.ppg);
  // Re-expand the weighted z (weights sum to 1, which shrinks variance), squash
  // into 0..100 via tanh, then rescale to 0.0..10.0 with one decimal.
  const score = 50 + 50 * Math.tanh(blendedZ * 1.6);
  return Math.round(score) / 10;
}

export const MIN_GAMES_RANKED = 3;

export function isProvisional(games: number): boolean {
  return games < MIN_GAMES_RANKED;
}
