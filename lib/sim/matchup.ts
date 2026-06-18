import { buildMatchScript, type MatchScript } from "./engine";
import { computeMatchEdge } from "./power";
import { hashStringToSeed } from "./rng";
import { buildTeam, powerInput, type TeamPlayer } from "./team";

// Team accent colours, matching the prediction bar / CompareRadar on the page.
export const TEAM_A_COLOR = "#003c33"; // deep-green
export const TEAM_B_COLOR = "#ff7759"; // coral

// One call from a server page: two players (+ their grounded inputs) and the
// site's own predictMatchup probability → a deterministic MatchScript. The seed
// is derived from a stable key so the same matchup replays identically by
// default (the Rematch control re-rolls it client-side for a fresh story).
//
// `target` is the rating(+h2h) prior from predictMatchup; computeMatchEdge then
// folds in attributes, gear, rank, experience, form and badges to get the edge
// the sim actually calibrates to — so all of those signals move the result, not
// just the rating gap.
export function scriptForMatchup(args: {
  a: TeamPlayer;
  b: TeamPlayer;
  aId: string;
  bId: string;
  ratingA: number;
  ratingB: number;
  target: number; // predictMatchup(...).probA — the rating(+h2h) prior
  pointsPerGame?: number;
}): MatchScript {
  const seed = hashStringToSeed(
    `${args.aId}|${args.bId}|${args.ratingA.toFixed(2)}|${args.ratingB.toFixed(2)}`
  );
  const teamA = buildTeam(args.a, "A", TEAM_A_COLOR);
  const teamB = buildTeam(args.b, "B", TEAM_B_COLOR);
  const edge = computeMatchEdge(powerInput(args.a), powerInput(args.b), args.target);
  return buildMatchScript({
    teamA,
    teamB,
    target: edge.target,
    seed,
    pointsPerGame: args.pointsPerGame,
    edge,
  });
}
