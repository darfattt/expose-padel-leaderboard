// Scoring-basis normalization. Mexicano/Americano events come in different
// point scales: a "first to 21" game and a fixed-sum "to 5" game (e.g. 3-2, 4-1,
// 5-0) carry the same competitive meaning but wildly different point magnitudes.
// The skill blend in lib/rating.ts is field-relative (z-scored), so it's already
// scale-invariant *within* one scale — but the reliability gates (absolute
// cumulative net points) and the close-game threshold are tuned for a ~21-point
// game, and mixing scales in one field corrupts the z-scores. We fix both by
// normalizing every game's points/conceded onto a common 21-point-equivalent
// scale before any aggregation. For 21-point data the factor is 1 (a no-op).

// The reference scale the reliability tiers (lib/rating.ts) are tuned for.
export const CANONICAL_POINTS_PER_GAME = 21;

// Multiplier that maps a game's raw points onto the canonical scale. A `to 5`
// game scales up ×4.2 (a 5-0 shutout becomes a 21-0 equivalent); a `to 21` game
// is unchanged. Defaults to 1 (canonical) for missing/invalid bases.
export function normFactor(pointsPerGame?: number | null): number {
  return pointsPerGame && pointsPerGame > 0
    ? CANONICAL_POINTS_PER_GAME / pointsPerGame
    : 1;
}

// Infer an event's per-game scoring basis (the most points one team can reach in
// a game) from its matches. Two formats occur:
//   • fixed-sum (Mexicano "to N"): every match's two scores sum to the same N, so
//     the basis is that constant total (a shutout is N-0).
//   • first-to-N (e.g. to 21): the winner's score is the constant N while totals
//     vary, so the basis is the highest single-team score seen.
// Detecting the fixed-sum case by a constant sum covers both: if sums vary we
// fall back to the max single-team score. Returns the canonical scale when there
// are no matches to learn from.
export function detectPointsPerGame(
  matches: { team1Score: number; team2Score: number }[]
): number {
  if (!matches.length) return CANONICAL_POINTS_PER_GAME;
  const sums = matches.map((m) => m.team1Score + m.team2Score);
  const constantSum = sums.every((s) => s === sums[0]);
  if (constantSum) return sums[0];
  return Math.max(...matches.map((m) => Math.max(m.team1Score, m.team2Score)));
}
