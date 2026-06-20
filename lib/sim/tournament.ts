import { proCandidates, proRank } from "../pros";
import { predictMatchup } from "../versus";
import { buildMatchScript, type MatchScript } from "./engine";
import { computeMatchEdge, type MatchEdge } from "./power";
import { hashStringToSeed, mulberry32 } from "./rng";
import { buildTeam, powerInput, type TeamPlayer } from "./team";
import { TEAM_A_COLOR, TEAM_B_COLOR } from "./matchup";

// An 8-team (16-player) single-elimination tournament, built on the same pure,
// deterministic match engine the Versus cartoon uses. Each "team" is a human
// entrant paired with their pro lookalike, so 8 entrants → 16 on-court players.
//
// The whole bracket is a pure function of (entrants, seed): given the same input
// it always plays out identically, so the client can replay *your* matches
// frame-for-frame and the auto-resolved matches stay consistent with what the
// bracket shows. Nothing is persisted — the tournament lives in the URL seed.
//
// Two flavour rules from the brief:
//   • Pro de-duplication — if two entrants would draw the same pro partner, the
//     later one slides to the next *similar* candidate (same rating/archetype
//     window), so a bracket never fields the same world pro twice (assignPros).
//   • Gearless death — an entrant with no racket "always dies when the ball is
//     hit": their team is calibrated to a near-certain loss (a shutout), and the
//     renderer collapses them on every contact (see MatchSim deathSide).

// Bracket layout: you always sit in slot 0, so your path is the *first* side of
// every pairing — QF[0] → SF[0] → Final. That keeps "you" on side A (the green,
// confetti-on-win side) through every round you survive.
export const FIELD_SIZE = 8; // teams (entrants); 16 players incl. pro partners

// A geared side facing a gearless one wins essentially every point — the
// gearless team is calibrated to this near-shutout so they "always die".
const GEARLESS_TARGET = 0.999;

export type RoundName = "QF" | "SF" | "F";

export const ROUND_LABEL: Record<RoundName, string> = {
  QF: "Quarter-final",
  SF: "Semi-final",
  F: "Final",
};

// One entrant: everything the match engine needs (TeamPlayer) plus identity and
// a real photo for the bracket/header. Plain data — serialisable from a Server
// Component straight into the client arena.
export interface TournamentEntry extends TeamPlayer {
  id: string;
  avatarUrl?: string | null;
}

// A seeded team in the bracket: the entrant, their de-duplicated pro partner,
// whether it's you, and the slot (0..7) that fixes the bracket geometry.
export interface BracketTeam {
  entry: TournamentEntry;
  pro: { name: string; rank: number };
  isYou: boolean;
  slot: number;
}

export interface MatchResult {
  winner: "A" | "B"; // side A is the first team of the pairing
  games: { a: number; b: number }[]; // per-game final scores
  gameWins: { a: number; b: number };
  gearlessSide: "A" | "B" | null; // a one-sided gear mismatch (the doomed side)
}

export interface PlayedMatch {
  round: RoundName;
  index: number; // position within the round (0-based)
  a: BracketTeam;
  b: BracketTeam;
  bestOf: 1 | 3;
  result: MatchResult;
  isYours: boolean;
  // The per-game scripts are only materialised for *your* matches (the ones the
  // arena actually renders) — auto-resolved matches keep just the outcome.
  scripts?: MatchScript[];
}

export interface TournamentRound {
  name: RoundName;
  matches: PlayedMatch[];
}

export interface Tournament {
  seed: number;
  teams: BracketTeam[]; // index === slot
  rounds: TournamentRound[];
  champion: BracketTeam;
  youReached: RoundName; // furthest round your team appeared in
  youWonIt: boolean;
  eliminated: boolean; // you were knocked out before the final
}

// --- seeding helpers --------------------------------------------------------

// Decorrelate a base seed by a couple of integer keys (round, index, game) so
// every match in the bracket draws an independent — but reproducible — stream.
function mixSeed(base: number, ...keys: number[]): number {
  let h = base >>> 0;
  for (const k of keys) h = (Math.imul(h ^ (k + 0x9e3779b9), 0x85ebca6b) >>> 0) >>> 0;
  return h >>> 0;
}

// Fisher–Yates with a seeded PRNG — a stable shuffle for slotting the field.
function shuffle<T>(arr: T[], seed: number): T[] {
  const out = arr.slice();
  const rng = mulberry32(seed >>> 0);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// --- pro de-duplication -----------------------------------------------------

// Hand each entrant a *distinct* pro partner. We walk the field in slot order
// and, for each entrant, prefer their *natural* pro twin — the exact top pick
// their player page shows (proCandidates' default rating/archetype window) — so
// an unclashed entrant gets the very same lookalike as their profile. Crucially
// "you" are seeded first (slot 0), so you never clash and always pair with the
// pro your own page crowns. Only on a real clash does a later entrant slide to
// the next rating/archetype-appropriate candidate (a wider band, so even a field
// bunched at one rating still yields eight distinct lookalikes). If every
// candidate is taken, we keep the natural pick (a rare dup beats an ill-matched pro).
export function assignPros(
  entries: TournamentEntry[]
): Map<string, { name: string; rank: number }> {
  const taken = new Set<string>();
  const out = new Map<string, { name: string; rank: number }>();
  for (const e of entries) {
    // The entrant's natural pro twin (default window) — matches the player page.
    const natural = proCandidates(e.rating, e.archetypePrimary, e.gender).pros[0];
    // A wider rank-appropriate band (≥ the field size) to slide into on a clash.
    const wide = proCandidates(e.rating, e.archetypePrimary, e.gender, FIELD_SIZE + 4).pros;
    const ordered = natural ? [natural, ...wide.filter((p) => p !== natural)] : wide;
    const name = ordered.find((p) => !taken.has(p)) ?? natural ?? wide[0] ?? "Unknown Pro";
    taken.add(name);
    const rank = proRank(name) ?? 90;
    out.set(e.id, { name, rank });
  }
  return out;
}

// --- match play -------------------------------------------------------------

// The calibrated edge for A, plus the labelled breakdown and which side (if any)
// is gear-doomed. A one-sided gear mismatch overrides the rating model entirely
// — the geared side is pinned to a near-certain win.
function edgeFor(a: BracketTeam, b: BracketTeam): {
  target: number;
  edge?: MatchEdge;
  gearlessSide: "A" | "B" | null;
} {
  const aGear = a.entry.hasRacket;
  const bGear = b.entry.hasRacket;
  if (aGear !== bGear) {
    return {
      target: aGear ? GEARLESS_TARGET : 1 - GEARLESS_TARGET,
      gearlessSide: aGear ? "B" : "A",
    };
  }
  const base = predictMatchup(a.entry.rating, b.entry.rating).probA;
  const edge = computeMatchEdge(powerInput(a.entry), powerInput(b.entry), base);
  return { target: edge.target, edge, gearlessSide: null };
}

// Play a single match (best-of-1 or best-of-3) between two bracket teams. Pure
// and deterministic per (seed, round, index). Returns the outcome plus the
// per-game scripts so the same call can both *resolve* a match headlessly and
// *render* your match — they can never disagree.
export function playMatch(
  a: BracketTeam,
  b: BracketTeam,
  baseSeed: number,
  round: RoundName,
  index: number,
  bestOf: 1 | 3
): { result: MatchResult; scripts: MatchScript[] } {
  const { target, edge, gearlessSide } = edgeFor(a, b);
  const teamA = buildTeam(a.entry, "A", TEAM_A_COLOR, a.pro);
  const teamB = buildTeam(b.entry, "B", TEAM_B_COLOR, b.pro);
  const need = bestOf === 3 ? 2 : 1;

  const scripts: MatchScript[] = [];
  const games: { a: number; b: number }[] = [];
  let aw = 0;
  let bw = 0;
  let g = 0;
  while (aw < need && bw < need) {
    const seed = mixSeed(baseSeed, round.charCodeAt(0), index, g);
    const script = buildMatchScript({ teamA, teamB, target, seed, edge });
    scripts.push(script);
    games.push({ a: script.finalScore.a, b: script.finalScore.b });
    if (script.winner === "A") aw++;
    else bw++;
    g++;
  }

  return {
    result: {
      winner: aw > bw ? "A" : "B",
      games,
      gameWins: { a: aw, b: bw },
      gearlessSide,
    },
    scripts,
  };
}

function winnerTeam(m: PlayedMatch): BracketTeam {
  return m.result.winner === "A" ? m.a : m.b;
}

// --- bracket construction ---------------------------------------------------

// Seed the 8-team field: you take slot 0, the other seven are shuffled into
// slots 1..7, then every team is handed a distinct pro partner.
export function seedTournament(entries: TournamentEntry[], youId: string, seed: number): BracketTeam[] {
  const you = entries.find((e) => e.id === youId);
  const others = entries.filter((e) => e.id !== youId);
  const ordered = you ? [you, ...shuffle(others, seed)] : shuffle(entries, seed);
  const pros = assignPros(ordered);
  return ordered.map((entry, slot) => ({
    entry,
    pro: pros.get(entry.id) ?? { name: "Unknown Pro", rank: 90 },
    isYou: entry.id === youId,
    slot,
  }));
}

function play(
  a: BracketTeam,
  b: BracketTeam,
  seed: number,
  round: RoundName,
  index: number,
  bestOf: 1 | 3
): PlayedMatch {
  const isYours = a.isYou || b.isYou;
  const { result, scripts } = playMatch(a, b, seed, round, index, bestOf);
  return { round, index, a, b, bestOf, result, isYours, scripts: isYours ? scripts : undefined };
}

// Run the whole bracket to a champion. QF and SF are best-of-1; the Final is
// best-of-3 (first to 2). "You" stay on side A of every pairing you reach.
export function runTournament(teams: BracketTeam[], seed: number): Omit<Tournament, "seed" | "teams"> {
  // Quarter-finals: adjacent slots pair up (you = slot 0, so your QF is 0 v 1).
  const qf = [
    play(teams[0], teams[1], seed, "QF", 0, 1),
    play(teams[2], teams[3], seed, "QF", 1, 1),
    play(teams[4], teams[5], seed, "QF", 2, 1),
    play(teams[6], teams[7], seed, "QF", 3, 1),
  ];
  const qw = qf.map(winnerTeam);

  // Semi-finals: QF winners pair in order, keeping your half first.
  const sf = [
    play(qw[0], qw[1], seed, "SF", 0, 1),
    play(qw[2], qw[3], seed, "SF", 1, 1),
  ];
  const sw = sf.map(winnerTeam);

  // Final — best of 3.
  const final = play(sw[0], sw[1], seed, "F", 0, 3);
  const champion = winnerTeam(final);

  const rounds: TournamentRound[] = [
    { name: "QF", matches: qf },
    { name: "SF", matches: sf },
    { name: "F", matches: [final] },
  ];

  // How far your team went: the latest round it actually appeared in.
  let youReached: RoundName = "QF";
  for (const r of rounds) if (r.matches.some((m) => m.isYours)) youReached = r.name;
  const youWonIt = champion.isYou;
  const eliminated = !youWonIt && youReached !== "F";

  return { rounds, champion, youReached, youWonIt, eliminated };
}

// One call builds the entire tournament from serialisable inputs (entrants +
// seed). Used by the client arena.
export function buildTournament(entries: TournamentEntry[], youId: string, seed: number): Tournament {
  const teams = seedTournament(entries, youId, seed);
  return { seed, teams, ...runTournament(teams, seed) };
}

// Pick the seven opponents for a given "you" from a candidate pool, prioritising
// players who already have gear (a geared field makes a real tournament; the
// gearless are only pulled in to fill an empty bracket — where they promptly
// die). Deterministic per seed. Returns up to seven ids.
export function pickOpponentIds(
  pool: { id: string; hasGear: boolean }[],
  youId: string,
  seed: number,
  count = FIELD_SIZE - 1
): string[] {
  const rest = pool.filter((p) => p.id !== youId);
  const geared = shuffle(rest.filter((p) => p.hasGear), seed).map((p) => p.id);
  const bare = shuffle(rest.filter((p) => !p.hasGear), mixSeed(seed, 1)).map((p) => p.id);
  return [...geared, ...bare].slice(0, count);
}

// A stable default seed for a given entrant, so a freshly opened tournament for
// the same player is reproducible until they re-roll.
export function defaultSeed(youId: string): number {
  return hashStringToSeed(`tournament|${youId}`);
}
