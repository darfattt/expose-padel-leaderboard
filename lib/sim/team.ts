import type { AttributeKey, Attributes } from "../archetype";
import { proCandidates } from "../pros";
import { racketPlayStyle, type RacketPlayStyle } from "../racket-reco";
import type { Gender } from "../types";
import { avatarFromName, type AvatarSpec } from "./avatar";
import { type PowerInput, staminaFor } from "./power";
import { gearMoniker, signatureKudos, type Skill, teamSkills } from "./skills";

// Effective per-axis stats for a 2v2 team: the human player blended with their
// pro lookalike. The pro raises the floor (they're rank-appropriate to the
// player's rating) and never drags a strong player down. These colour the rally
// *drama* (shot speed, error rate, skill triggers) AND the within-match flow —
// clutch decides who owns the big points, stamina who holds up late (see
// engine.ts). The headline who-wins edge is computed separately in power.ts.
export interface EffectiveStats {
  attack: number;
  consistency: number;
  clutch: number;
  win: number;
  stamina: number; // 0..100 staying power late in a game (consistency + mileage)
}

export interface TeamSpec {
  side: "A" | "B";
  playerName: string;
  proName: string;
  proRank: number;
  stats: EffectiveStats;
  skills: Skill[];
  avatars: [AvatarSpec, AvatarSpec]; // [player, partner pro]
  color: string; // accent (deep-green for A, coral for B) — matches the page
}

// rank 1..90 → ~100..55: even the world #90 is a strong floor, the #1 is a
// ceiling. Linear over the top-90 ladder.
export function proFloor(rank: number): number {
  const r = Math.min(90, Math.max(1, rank));
  return 100 - ((r - 1) / 89) * 45;
}

// 70% the player's own attribute, 30% the pro floor. Weights are a tuned
// starting point (see the design doc); covered by team.test.ts.
const PLAYER_WEIGHT = 0.7;
const PRO_WEIGHT = 0.3;

export function blendStats(attrs: Attributes, proRank: number, experienceGames = 0): EffectiveStats {
  const floor = proFloor(proRank);
  const blend = (a: number) => PLAYER_WEIGHT * a + PRO_WEIGHT * floor;
  return {
    attack: blend(attrs.attack),
    consistency: blend(attrs.consistency),
    clutch: blend(attrs.clutch),
    win: blend(attrs.win),
    // Stamina is built from the *blended* consistency (the pro steadies you too)
    // plus the human's own match mileage.
    stamina: staminaFor(blend(attrs.consistency), experienceGames),
  };
}

// Minimal slice of a RankedPlayer the sim needs — keeps team.ts decoupled from
// the (DB-backed) leaderboard module and trivially testable. The rich fields are
// optional: omit them and the player reads as a neutral, unproven entrant (no
// rank, no mileage, even form, no badges) so older callers/tests still work.
export interface TeamPlayer {
  name: string;
  rating: number;
  attributes: Attributes;
  archetypePrimary: AttributeKey | "balanced";
  hasRacket: boolean; // whether the player has a racket set in their gear
  racketName?: string | null; // model name, for personalised gear-skill labels
  racketBrand?: string | null; // brand, trimmed from the moniker when redundant
  gearRating?: number | null; // racket's catalogue review score (0–10); higher = stronger weapon
  rank?: number | null; // leaderboard rank (1 = best); null/undefined = provisional
  fieldSize?: number; // size of the ranked field, to normalize rank
  experienceGames?: number; // career games played (veterancy → stamina + edge)
  form?: number; // recent win rate in [0,1]; 0.5 = neutral / unknown
  morale?: number; // earned good badges minus bad badges (signed)
  gender?: Gender | null; // selects the FIP ladder for the pro + the sprite's look
}

// Build one side's team spec. The pro lookalike is the top candidate from
// proCandidates (rank-appropriate to the rating, rotated by archetype); its rank
// is the best (numerically lowest) offered, which is exactly candidates.pros[0].
//
// `forcedPro` overrides the auto-pick — the tournament uses it to hand a team a
// *specific* (already de-duplicated) pro partner so no two teams in the same
// bracket field share a lookalike (see lib/sim/tournament.ts assignPros).
export function buildTeam(
  player: TeamPlayer,
  side: "A" | "B",
  color: string,
  forcedPro?: { name: string; rank: number }
): TeamSpec {
  // The pro lookalike (and so the partner's name + sprite) is drawn from the
  // gender-appropriate FIP ladder — a women's player gets a women's pro, not the
  // men's default. The same gender drives both on-court sprites' look.
  const candidates = proCandidates(player.rating, player.archetypePrimary, player.gender);
  const proName = forcedPro?.name ?? candidates.pros[0] ?? "Unknown Pro";
  const proRank = forcedPro?.rank ?? candidates.rankLow ?? 90;
  // The player's gender pins both sprites' look; undefined leaves it name-derived
  // (so older callers without a gender are unchanged).
  const avatarGender = player.gender ?? undefined;

  // Racket play-style is grounded in the player's own attributes; we only
  // surface the racket skill when they've actually set a racket (gear optional).
  const style: RacketPlayStyle | null = player.hasRacket ? racketPlayStyle(player.attributes) : null;
  // A personalised label for the racket move ("Vertex Smash"), and the player's
  // signature Reclub kudos move, both derived from the grounded profile.
  const moniker =
    player.hasRacket && player.racketName
      ? gearMoniker(player.racketName, player.racketBrand)
      : null;
  const kudos = signatureKudos(player.attributes, player.archetypePrimary, style);

  return {
    side,
    playerName: player.name,
    proName,
    proRank,
    stats: blendStats(player.attributes, proRank, player.experienceGames ?? 0),
    skills: teamSkills(style, player.archetypePrimary, { gearMoniker: moniker, kudos }),
    avatars: [
      avatarFromName(player.name, color, avatarGender),
      avatarFromName(proName, undefined, avatarGender),
    ],
    color,
  };
}

// Map a TeamPlayer onto the edge model's PowerInput (lib/sim/power.ts). Defaults
// fill the optional rich fields so a bare player reads as neutral/unproven.
export function powerInput(player: TeamPlayer): PowerInput {
  return {
    attributes: player.attributes,
    rank: player.rank ?? null,
    fieldSize: player.fieldSize ?? 1,
    experienceGames: player.experienceGames ?? 0,
    hasRacket: player.hasRacket,
    racketStyle: player.hasRacket ? racketPlayStyle(player.attributes) : null,
    gearRating: player.gearRating ?? null,
    form: player.form ?? 0.5,
    morale: player.morale ?? 0,
  };
}
