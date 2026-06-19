import type { MatchEdge } from "./power";
import { mulberry32 } from "./rng";
import type { Skill } from "./skills";
import type { TeamSpec } from "./team";

// The pure rally → point → match simulation. It produces a MatchScript — a
// deterministic timeline the renderer dumbly plays back — so the whole outcome
// is unit-testable without a DOM.
//
// These leagues play Mexicano/Americano *fixed-sum* games: exactly N points are
// contested and the two scores sum to N (e.g. a "to 21" game ends 13–8, 21–0,
// 11–10 — never 21–18). So the sim distributes N points and the majority wins —
// it is NOT a first-to-N race (which would overshoot to ~2N points and pin the
// winner at N). See lib/scoring.ts (detectPointsPerGame).
//
// The base per-point win probability `p` for team A is derived (binomial inverse
// below, by bisection) so that taking the majority of N points yields A winning ≈
// `target` of the time — where `target` is the *rich* edge from power.ts (rating
// gap + attributes + gear + rank + experience + form + badges), not the bare
// rating prediction. On top of that anchor, each point is then nudged live by:
//
//   • momentum — a side on a run gets a temporary lift, so matches develop
//     streaks, runs and comebacks instead of independent coin-flips;
//   • clutch   — on game-point pressure the cooler team (higher clutch) gets the
//     edge, so the big points actually reward the clutch attribute;
//   • stamina  — late in a game the steadier / more experienced team holds up.
//
// The anchor keeps the *average* outcome honest to the edge; the live nudges
// make any single match dramatic and varied (and a fresh seed → a fresh story —
// see the Rematch control in MatchSim). All deterministic per seed, no DOM.

// Points contested in one game (the fixed sum of the two scores). Odd, so the
// majority is unambiguous (no draws). Matches the league's "to 21".
export const DEFAULT_POINTS_PER_GAME = 21;

// Live per-point modulation strengths (added to the base probability for A).
// Momentum is zero-mean across a match (both sides catch fire); clutch and
// stamina are directional — they're how the clutch attribute and experience earn
// their keep. Kept modest so the calibrated edge still rules the long run.
const MOMENTUM_K = 0.07; // peak lift from a hot streak
const CLUTCH_K = 0.13; // swing on game-point pressure, per full clutch gap
const STAMINA_K = 0.1; // swing by the death of a game, per full stamina gap
const P_FLOOR = 0.03;
const P_CEIL = 0.97;

// A single ball contact, in normalized court coords (x: 0 = far left/team A
// baseline, 1 = far right/team B baseline; y: 0 = top, 1 = bottom).
export interface Hit {
  x: number;
  y: number;
}

export interface PointEvent {
  index: number; // 0-based point number
  server: "A" | "B";
  winner: "A" | "B";
  rally: Hit[]; // ball contacts; last entry is the winning shot landing
  big: boolean; // game/match point — drives the clutch flash
  skill?: { team: "A" | "B"; skill: Skill };
  scoreA: number; // score AFTER this point
  scoreB: number;
}

export interface MatchScript {
  seed: number;
  target: number; // the rich edge probA the sim is calibrated to
  p: number; // base (anchor) per-point win prob for A
  pointsPerGame: number; // fixed sum of the two final scores (the game length)
  teamA: TeamSpec;
  teamB: TeamSpec;
  points: PointEvent[];
  winner: "A" | "B";
  finalScore: { a: number; b: number };
  edge?: MatchEdge; // the labeled breakdown behind `target` (when built via matchup.ts)
}

// Strict majority of n points (n odd ⇒ no ties): the count A must reach to win.
function majority(n: number): number {
  return Math.floor(n / 2) + 1;
}

// P(A takes the majority of a fixed n-point game, winning each point i.i.d.
// w.p. p) = P(Binomial(n, p) ≥ majority(n)). Computed by rolling the pmf so there
// are no large factorials. Monotonic increasing in p, so it inverts cleanly.
export function fixedSumWinProb(p: number, n: number): number {
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  const need = majority(n);
  const ratio = p / (1 - p);
  let pmf = Math.pow(1 - p, n); // P(A wins exactly 0 points)
  let prob = 0;
  for (let k = 0; k <= n; k++) {
    if (k >= need) prob += pmf;
    pmf = (pmf * ((n - k) / (k + 1))) * ratio; // pmf for k+1
  }
  return prob;
}

// Invert fixedSumWinProb: find the per-point p that makes A's game-win rate equal
// `target`. Bisection — fixedSumWinProb is monotonic in p, so 60 steps nails it.
export function calibrateP(target: number, n: number = DEFAULT_POINTS_PER_GAME): number {
  const t = Math.min(0.999, Math.max(0.001, target));
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (fixedSumWinProb(mid, n) < t) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// Play one fixed-sum game of n points with a given PRNG; returns just the
// outcome (used by the calibration test and internally by the script builder).
export function simulateGame(
  p: number,
  n: number,
  rng: () => number
): { winner: "A" | "B"; a: number; b: number } {
  let a = 0;
  let b = 0;
  for (let i = 0; i < n; i++) {
    if (rng() < p) a++;
    else b++;
  }
  return { winner: a > b ? "A" : "B", a, b };
}

// Monte-Carlo A-win rate over `trials` independent seeds. The calibration test
// asserts this lands within tolerance of the target. Each trial gets its own
// decorrelated seed derived from the base.
export function simulatedWinRate(
  p: number,
  n: number,
  seed: number,
  trials: number
): number {
  let wins = 0;
  for (let i = 0; i < trials; i++) {
    const rng = mulberry32((seed + Math.imul(i, 0x9e3779b9)) >>> 0);
    if (simulateGame(p, n, rng).winner === "A") wins++;
  }
  return wins / trials;
}

export interface SimInput {
  teamA: TeamSpec;
  teamB: TeamSpec;
  target: number; // the rich edge probA (power.ts) — or a bare prediction
  seed: number;
  pointsPerGame?: number;
  edge?: MatchEdge; // optional labeled breakdown to carry onto the script
}

// Court x-anchors for a side-on rally (team A on the left, B on the right).
const NEAR_A = 0.3;
const NEAR_B = 0.7;

function clampP(p: number): number {
  return Math.min(P_CEIL, Math.max(P_FLOOR, p));
}

// The live per-point win probability for A: the calibrated anchor, lifted by
// momentum (toward whoever is on a run), tilted on game-point pressure toward the
// cooler team, and tilted late toward the team with more left in the tank.
function pointProbA(
  base: number,
  input: SimInput,
  state: { streak: number; a: number; b: number; n: number; big: boolean }
): number {
  const { teamA, teamB } = input;
  // Momentum: signed streak (>0 = A rolling) squashed so it saturates, zero-mean.
  const momentum = MOMENTUM_K * Math.tanh(state.streak / 3);
  // Clutch only bites under game-point pressure; rewards the higher-clutch team.
  const clutch = state.big ? (CLUTCH_K * (teamA.stats.clutch - teamB.stats.clutch)) / 100 : 0;
  // Stamina ramps in with match progress (0 at first point → ~1 at the death).
  const progress = state.n > 1 ? Math.min(1, (state.a + state.b) / (state.n - 1)) : 1;
  const stamina = (STAMINA_K * progress * (teamA.stats.stamina - teamB.stats.stamina)) / 100;
  return clampP(base + momentum + clutch + stamina);
}

// Build the full, deterministic MatchScript. Point winners come from the live
// per-point probability (anchored to `target`, then nudged by momentum / clutch /
// stamina); rally geometry and skill flashes are flavour seeded from the same PRNG.
export function buildMatchScript(input: SimInput): MatchScript {
  const n = input.pointsPerGame ?? DEFAULT_POINTS_PER_GAME;
  const need = majority(n);
  const p = calibrateP(input.target, n);
  const rng = mulberry32(input.seed >>> 0);

  const points: PointEvent[] = [];
  let a = 0;
  let b = 0;
  let index = 0;
  let server: "A" | "B" = "A";
  let streak = 0; // signed run length: + = team A on a roll, − = team B

  // Fixed-sum: contest exactly n points; the two scores sum to n and the majority
  // wins (the game runs its full length, so a runaway can reach n–0).
  while (a + b < n) {
    // "Big" = clinch pressure: a team sits one point from securing the majority,
    // judged on the score *entering* the point so clutch can bias who takes it.
    const big = a === need - 1 || b === need - 1;
    const pEff = pointProbA(p, input, { streak, a, b, n, big });

    const winner: "A" | "B" = rng() < pEff ? "A" : "B";
    if (winner === "A") a++;
    else b++;

    // Update the momentum streak for the next point.
    if (winner === "A") streak = streak >= 0 ? streak + 1 : 1;
    else streak = streak <= 0 ? streak - 1 : -1;

    // Rally length leans on the *combined* consistency of the two teams: steady
    // players trade more balls before the point ends. Cosmetic only.
    const steadiness = (input.teamA.stats.consistency + input.teamB.stats.consistency) / 200; // 0..1
    const exchanges = 2 + Math.floor(rng() * (2 + steadiness * 6));

    const rally: Hit[] = [];
    let side: "A" | "B" = server;
    for (let k = 0; k < exchanges; k++) {
      const baseX = side === "A" ? NEAR_A : NEAR_B;
      rally.push({ x: baseX + (rng() - 0.5) * 0.1, y: 0.2 + rng() * 0.6 });
      side = side === "A" ? "B" : "A";
    }
    // Winning shot lands deep on the loser's side.
    const loser = winner === "A" ? "B" : "A";
    rally.push({
      x: loser === "A" ? 0.08 + rng() * 0.12 : 0.8 + rng() * 0.12,
      y: 0.12 + rng() * 0.7,
    });

    // Skill flash: big points lean on the pro's clutch signature; otherwise an
    // attacking team can flash one of its *own* moves — the racket move or the
    // player's Reclub kudos signature, rotated by the PRNG so both surface over a
    // match. Picked from the winner's own skill list so the label is always grounded.
    const team = winner === "A" ? input.teamA : input.teamB;
    let skill: PointEvent["skill"];
    if (big && team.stats.clutch > 55 && rng() < 0.6) {
      const pro = team.skills.find((s) => s.source === "pro");
      if (pro) skill = { team: winner, skill: pro };
    } else if (team.stats.attack > 55 && rng() < 0.3) {
      const own = team.skills.filter((s) => s.source !== "pro");
      const move = own.length ? own[Math.floor(rng() * own.length)] : team.skills[0];
      if (move) skill = { team: winner, skill: move };
    }

    points.push({ index, server, winner, rally, big, skill, scoreA: a, scoreB: b });
    index++;
    server = server === "A" ? "B" : "A";
  }

  return {
    seed: input.seed >>> 0,
    target: input.target,
    p,
    pointsPerGame: n,
    teamA: input.teamA,
    teamB: input.teamB,
    points,
    winner: a > b ? "A" : "B",
    finalScore: { a, b },
    edge: input.edge,
  };
}
