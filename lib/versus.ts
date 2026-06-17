import { MIN_SHARED_GAMES } from "./relationships";

// Grounded win prediction for a head-to-head matchup. Two signals, blended:
//   1. The rating gap → a logistic win probability (always available).
//   2. Their actual head-to-head record, once they've met enough times.
// The blend is weighted by how much head-to-head evidence exists, so a long
// rivalry overrides the rating prior while a single meeting barely nudges it.
// Pure + field-free like the rest of lib/ — computed on read, nothing persisted.

// Logistic steepness on the 0–7 rating scale. A 1.0-point edge ⇒ ~65%, a
// 2.0-point edge ⇒ ~77%. Tuned to feel right for recreational padel rather than
// to model true odds (the field is small and ratings move fast).
export const RATING_K = 0.6;

// How fast head-to-head evidence takes over from the rating prior: at this many
// shared games the actual record carries half the weight (games / (games + K)).
export const H2H_HALF_WEIGHT = 4;

export interface MatchupPrediction {
  probA: number; // P(player A wins), 0..1
  probB: number; // P(player B wins) = 1 - probA
  ratingProbA: number; // the rating-only prior, before any head-to-head blend
  h2hWeight: number; // 0..1: how much the actual record informed the result
  basis: "rating" | "rating+h2h";
}

// Logistic win probability for A from the rating gap alone. Symmetric:
// ratingWinProb(a, b) === 1 - ratingWinProb(b, a), and equal ratings ⇒ 0.5.
export function ratingWinProb(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.exp(-RATING_K * (ratingA - ratingB)));
}

// h2h is player A's record vs B (wins out of games), or null/undefined when they
// have never met. Draws count as non-wins, matching the winRate convention used
// throughout lib/relationships.
export function predictMatchup(
  ratingA: number,
  ratingB: number,
  h2h?: { wins: number; games: number } | null
): MatchupPrediction {
  const ratingProbA = ratingWinProb(ratingA, ratingB);

  // Below the rivalry threshold the record is noise — fall back to the prior.
  if (!h2h || h2h.games < MIN_SHARED_GAMES) {
    return { probA: ratingProbA, probB: 1 - ratingProbA, ratingProbA, h2hWeight: 0, basis: "rating" };
  }

  const empiricalA = h2h.wins / h2h.games;
  const w = h2h.games / (h2h.games + H2H_HALF_WEIGHT);
  const probA = w * empiricalA + (1 - w) * ratingProbA;
  return { probA, probB: 1 - probA, ratingProbA, h2hWeight: w, basis: "rating+h2h" };
}

export function pct(p: number): number {
  return Math.round(p * 100);
}
