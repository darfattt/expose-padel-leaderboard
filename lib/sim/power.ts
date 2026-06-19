import type { Attributes } from "../archetype";
import type { RacketPlayStyle } from "../racket-reco";

// The "what tilts the court" model. predictMatchup (lib/versus.ts) gives a
// headline win probability from the rating gap (+ head-to-head). This module
// folds in everything *else* the app knows about a player — their display
// attributes, the racket in their bag, where they sit on the ladder, how many
// games they've logged, their recent form, and the badges they've earned — into
// a single edge the 2D sim calibrates to, plus a labeled breakdown so the page
// can show *why* one side is favoured beyond the raw rating.
//
// Pure + framework-agnostic like the rest of lib/: no DB, no Date.now(), so the
// whole thing is unit-testable and replays identically for a given input.

// Everything the edge model needs about one side, beyond the rating. All of it
// is read-time fact about the player (see lib/leaderboard, lib/queries,
// lib/achievements) — nothing is invented here.
export interface PowerInput {
  attributes: Attributes;
  rank: number | null; // leaderboard rank, 1 = best; null while provisional
  fieldSize: number; // ranked field size, to normalize rank into 0..1
  experienceGames: number; // career games played (veterancy / steadiness)
  hasRacket: boolean; // a racket is registered in their profile
  racketStyle: RacketPlayStyle | null; // computed play-style of that racket
  gearRating?: number | null; // the racket's catalogue review score (0–10); higher = a stronger weapon
  form: number; // recent win rate in [0,1]; 0.5 = neutral / unknown
  morale: number; // earned good badges minus bad badges (raw, signed)
}

// One labeled contribution to A's win probability, in percentage points (can be
// negative — a factor can favour B). The page lists these so the cartoon's edge
// is legible: "Gear +4%, Experience −2%, …".
export interface PowerFactor {
  key: string;
  label: string;
  delta: number; // signed, percentage points added to A's win chance
  detail: string; // short human note on what drove it
}

export interface MatchEdge {
  target: number; // P(A wins), 0..1 — what the sim is calibrated to
  baseTarget: number; // the rating(+h2h) prior this started from
  factors: PowerFactor[]; // non-zero nudges, biggest magnitude first
}

// How hard each signal can pull, in log-odds. Rating still dominates (it sets
// the base); these are deliberately bounded so gear/experience/form *colour* a
// matchup and can flip a close one, but can't fabricate an upset across a chasm.
const WEIGHT = {
  attributes: 0.9,
  gear: 0.5,
  experience: 0.5,
  rank: 0.3,
  form: 0.45,
  morale: 0.4,
} as const;

// Total swing the extra factors may add on top of the rating prior (log-odds).
// ~±1.6 logit ≈ enough to turn a 50/50 into ~83/17, or claw a 70/30 back to even.
const MAX_SWING = 1.6;

// Gear scoring. A registered racket is a flat baseline edge (you've dialled in
// your kit); a power frame leans into winners, a control frame into retrieval;
// and the better the frame — its catalogue review score — the more it adds, so a
// top-rated weapon out-guns a budget paddle.
const GEAR_BASE = 0.6; // owning any racket
// Catalogue review scores for real frames cluster high, so anchor the quality
// bonus at this floor (a rating at/below it adds nothing) and let a perfect 10
// add the full GEAR_QUALITY_MAX on top.
const GEAR_RATING_FLOOR = 5;
const GEAR_QUALITY_MAX = 0.8;

function clampProb(p: number): number {
  return Math.min(1 - 1e-4, Math.max(1e-4, p));
}
function logit(p: number): number {
  const c = clampProb(p);
  return Math.log(c / (1 - c));
}
function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

// A single 0..100 "overall" off the five display attributes. Win and consistency
// carry a touch more weight — winning and not beating yourself travel best across
// the recreational field — but every axis counts.
export function overallAttribute(a: Attributes): number {
  return (
    a.attack * 0.2 +
    a.defense * 0.15 +
    a.consistency * 0.25 +
    a.clutch * 0.15 +
    a.win * 0.25
  );
}

// A racket's catalogue review score (0–10) → a quality bonus on top of simply
// owning a frame: the higher the gear, the more powerful. Unknown rating (older
// gear, or a frame off the catalogue) adds nothing, so the edge falls back to the
// flat base — no one is penalised for a missing score.
function gearQuality(rating: number | null | undefined): number {
  if (rating == null || !Number.isFinite(rating)) return 0;
  const r = Math.min(10, Math.max(0, rating));
  return (Math.max(0, r - GEAR_RATING_FLOOR) / (10 - GEAR_RATING_FLOOR)) * GEAR_QUALITY_MAX;
}

// Gear score: having a racket on file is a real edge (you've dialled in your
// kit); a power frame leans into winners, a control frame into retrieval; and a
// better-rated frame adds more still — higher gear, more power.
function gearScore(input: PowerInput): number {
  if (!input.hasRacket) return 0;
  const styleBonus = input.racketStyle === "power" ? 0.2 : input.racketStyle === "control" ? 0.12 : 0.06;
  return GEAR_BASE + styleBonus + gearQuality(input.gearRating);
}

// Experience: diminishing returns on career games — the first season teaches you
// most of what steadies a match; beyond that it flattens.
function experienceScore(games: number): number {
  return Math.tanh(Math.max(0, games) / 60);
}

// Rank score in 0..1 (1 = top of the ladder). Provisional players (no rank) sit
// low but not zero — they're unproven, not bad. Correlated with rating, so its
// weight is the smallest of the bunch.
function rankScore(rank: number | null, fieldSize: number): number {
  if (rank == null) return 0.25;
  if (fieldSize <= 1) return 1;
  return 1 - (rank - 1) / (fieldSize - 1);
}

// Morale from earned badges: a signed count squashed into −1..1. A wall of good
// badges says "this player delivers"; a pile of shame badges drags.
function moraleScore(morale: number): number {
  return Math.tanh(morale / 8);
}

// Stamina/steadiness 0..100 the engine uses to decide who holds up late: mostly
// consistency, topped up by veterancy. Capped at 100. Shared with team.ts so the
// formula lives in one place.
export function staminaFor(consistency: number, experienceGames: number): number {
  return Math.min(100, consistency * 0.75 + experienceScore(experienceGames) * 30 + 12);
}

// Convert a log-odds nudge (relative to the base) into a percentage-point delta
// on A's win chance, so the breakdown reads in the same units as the bar.
function asPct(z0: number, delta: number): number {
  return Math.round((sigmoid(z0 + delta) - sigmoid(z0)) * 1000) / 10;
}

// The headline computation: blend the rating prior with the richer signals into
// a calibrated target and an ordered, labeled breakdown.
export function computeMatchEdge(a: PowerInput, b: PowerInput, baseTarget: number): MatchEdge {
  const z0 = logit(baseTarget);

  const raw: Omit<PowerFactor, "delta">[] = [];
  const deltas: number[] = [];

  const push = (key: string, label: string, detail: string, z: number) => {
    raw.push({ key, label, detail });
    deltas.push(z);
  };

  // Attributes — the radar made tangible.
  const attrA = overallAttribute(a.attributes);
  const attrB = overallAttribute(b.attributes);
  push(
    "attributes",
    "Attributes",
    attrA >= attrB ? "Sharper all-round profile" : "Out-gunned on the radar",
    WEIGHT.attributes * ((attrA - attrB) / 100)
  );

  // Gear — the racket in the bag, weighed by how good a frame it is.
  const gearA = gearScore(a);
  const gearB = gearScore(b);
  push(
    "gear",
    "Gear",
    gearA === gearB
      ? "Evenly kitted"
      : gearA > gearB
        ? "Stronger frame in hand"
        : "Out-gunned on equipment",
    WEIGHT.gear * (gearA - gearB)
  );

  // Experience — games in the legs.
  const expA = experienceScore(a.experienceGames);
  const expB = experienceScore(b.experienceGames);
  push(
    "experience",
    "Experience",
    expA >= expB ? "More matches in the legs" : "Less mileage on court",
    WEIGHT.experience * (expA - expB)
  );

  // Rank — where they sit on the ladder.
  const rkA = rankScore(a.rank, a.fieldSize);
  const rkB = rankScore(b.rank, b.fieldSize);
  push(
    "rank",
    "Ladder",
    rkA >= rkB ? "Standing higher on the board" : "Lower on the board",
    WEIGHT.rank * (rkA - rkB)
  );

  // Form — how they're trending right now.
  const fmA = (a.form - 0.5) * 2;
  const fmB = (b.form - 0.5) * 2;
  push(
    "form",
    "Form",
    fmA >= fmB ? "Hotter recent form" : "Colder run of late",
    WEIGHT.form * (fmA - fmB)
  );

  // Morale — the badge wall.
  const mrA = moraleScore(a.morale);
  const mrB = moraleScore(b.morale);
  push(
    "morale",
    "Badges",
    mrA >= mrB ? "Decorated, confident" : "Thinner trophy cabinet",
    WEIGHT.morale * (mrA - mrB)
  );

  // Clamp the *combined* extra swing, then re-scale each delta proportionally so
  // the per-factor percentages still sum to the actual shift (no double-telling).
  const rawSum = deltas.reduce((s, d) => s + d, 0);
  const clampedSum = Math.max(-MAX_SWING, Math.min(MAX_SWING, rawSum));
  const scale = rawSum === 0 ? 0 : clampedSum / rawSum;

  const target = sigmoid(z0 + clampedSum);

  const factors: PowerFactor[] = raw
    .map((f, i) => ({ ...f, delta: asPct(z0, deltas[i] * scale) }))
    .filter((f) => Math.abs(f.delta) >= 0.1)
    .sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));

  return { target, baseTarget, factors };
}
