import { type FieldStats, type PlayerMetrics, scaleFromZ, z } from "./stats";

export type AttributeKey = "attack" | "defense" | "consistency" | "clutch" | "win";

export interface Attributes {
  attack: number;
  defense: number;
  consistency: number;
  clutch: number;
  win: number;
}

export interface ArchetypeField {
  ppg: FieldStats;
  concededPg: FieldStats;
  variance: FieldStats;
  closeWinRate: FieldStats;
  winRate: FieldStats;
}

export interface Archetype {
  key: string; // "power", "balanced", or a compound like "power+clutch"
  primary: AttributeKey | "balanced"; // dominant trait — drives pro lookup & styling
  label: string;
  description: string;
}

// z per *display* attribute (higher = better; defense & consistency invert).
// NOTE: in fixed-sum games (each match totals a constant, e.g. 21) every
// player's points-for + points-against per game is constant, so defense's z is
// mathematically identical to attack's. They carry the same signal and so are
// merged into one "power" axis for archetype selection (see SELECT_AXES below).
function attributeZ(m: PlayerMetrics, field: ArchetypeField): Record<AttributeKey, number> {
  return {
    attack: z(m.ppg, field.ppg),
    defense: -z(m.concededPg, field.concededPg),
    consistency: -z(m.variance, field.variance),
    clutch: z(m.closeWinRate, field.closeWinRate),
    win: z(m.winRate, field.winRate),
  };
}

export function computeAttributes(m: PlayerMetrics, field: ArchetypeField): Attributes {
  const zs = attributeZ(m, field);
  return {
    attack: scaleFromZ(zs.attack),
    defense: scaleFromZ(zs.defense),
    consistency: scaleFromZ(zs.consistency),
    clutch: scaleFromZ(zs.clutch),
    win: scaleFromZ(zs.win),
  };
}

// Independent axes the archetype is actually picked from. "power" folds the
// redundant attack/defense pair into a single scoreboard-dominance trait, so
// the four axes are genuinely distinct and pair into varied combinations.
type SelectKey = "power" | "consistency" | "clutch" | "win";

// Each select axis: its z (from attributeZ) and the pro-lookup key it maps to.
const SELECT_AXES: { key: SelectKey; from: AttributeKey; primary: AttributeKey }[] = [
  { key: "power", from: "attack", primary: "attack" },
  { key: "consistency", from: "consistency", primary: "consistency" },
  { key: "clutch", from: "clutch", primary: "clutch" },
  { key: "win", from: "win", primary: "win" },
];

// Single-trait archetypes: one axis stands clear of the rest.
const SINGLE: Record<SelectKey, { label: string; description: string }> = {
  power: { label: "The Powerhouse", description: "Dominates the scoreboard — wins the point battle at both ends." },
  consistency: { label: "The Metronome", description: "Reliable, low-variance results round after round." },
  clutch: { label: "The Ice Man", description: "Thrives in tight games — ice-cold when it's on the line." },
  win: { label: "The Dominator", description: "Wins more than anyone, however the points fall." },
};

const BALANCED = { label: "The All-Rounder", description: "No single standout trait — solid across the board." };

// Compound archetypes: the two strongest axes, keyed by the sorted pair so the
// lookup is order-independent. Four axes → six combinations.
const COMPOUND: Record<string, { label: string; description: string }> = {
  "clutch|consistency": { label: "The Surgeon", description: "Cool and repeatable, and sharpest in the tight ones." },
  "clutch|power": { label: "The Finisher", description: "Big point margins that peak when games go down to the wire." },
  "clutch|win": { label: "The Closer", description: "Wins more than anyone, especially when it's on the line." },
  "consistency|power": { label: "The Anchor", description: "Dominant and unshakeable — steady control of every game." },
  "consistency|win": { label: "The Machine", description: "Relentless, metronomic, and almost always on the winning side." },
  "power|win": { label: "The Juggernaut", description: "Outscores the whole field and turns it into wins." },
};

// A trait must clear this to count as a standout at all.
const STANDOUT = 0.4;
// A second trait this strong promotes the player to a compound archetype.
const COMPOUND_MIN = 0.3;

/**
 * Archetype from the two strongest independent axes (power/consistency/clutch/win):
 *   - top axis below STANDOUT       → balanced (nothing stands out)
 *   - second axis >= COMPOUND_MIN   → compound archetype of {top, second}
 *   - otherwise                     → single-axis archetype (top only)
 */
export function pickArchetype(m: PlayerMetrics, field: ArchetypeField): Archetype {
  const zs = attributeZ(m, field);
  const ranked = [...SELECT_AXES].sort((a, b) => zs[b.from] - zs[a.from]);
  const top = ranked[0];
  const second = ranked[1];

  if (zs[top.from] < STANDOUT) {
    return { key: "balanced", primary: "balanced", ...BALANCED };
  }

  if (zs[second.from] >= COMPOUND_MIN) {
    const pairKey = [top.key, second.key].sort().join("|");
    const compound = COMPOUND[pairKey];
    if (compound) {
      return { key: [top.key, second.key].join("+"), primary: top.primary, ...compound };
    }
  }

  return { key: top.key, primary: top.primary, ...SINGLE[top.key] };
}
