import { type FieldStats, type PlayerMetrics, scaleFromZ, z } from "./stats";

// Performance rating: field-relative blend of win rate, point differential,
// and points-per-game, mapped to 0..100. Not history-dependent — recomputed
// from the whole field on every read.
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
  // Re-expand the weighted z (weights sum to 1, which shrinks variance).
  return scaleFromZ(blendedZ * 1.6, 1);
}

export const MIN_GAMES_RANKED = 3;

export function isProvisional(games: number): boolean {
  return games < MIN_GAMES_RANKED;
}
