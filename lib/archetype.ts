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
  key: AttributeKey | "balanced";
  label: string;
  description: string;
}

const ARCHETYPES: Record<AttributeKey | "balanced", Omit<Archetype, "key">> = {
  attack: { label: "The Engine", description: "Pure scoring output — racks up points every game." },
  defense: { label: "The Wall", description: "Concedes the fewest points; opponents grind for every point." },
  consistency: { label: "The Metronome", description: "Reliable, low-variance results round after round." },
  clutch: { label: "The Closer", description: "Wins the tight ones — thrives when games go down to the wire." },
  win: { label: "The Dominator", description: "Wins more than anyone, however the points fall." },
  balanced: { label: "The All-Rounder", description: "No single standout trait — solid across the board." },
};

// z per attribute (higher = better; defense & consistency invert their metric).
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

// Primary archetype = strongest field-relative attribute; balanced if nothing
// stands out (best attribute is within half a standard deviation of the field).
export function pickArchetype(m: PlayerMetrics, field: ArchetypeField): Archetype {
  const zs = attributeZ(m, field);
  let bestKey: AttributeKey = "win";
  let bestZ = -Infinity;
  (Object.keys(zs) as AttributeKey[]).forEach((k) => {
    if (zs[k] > bestZ) {
      bestZ = zs[k];
      bestKey = k;
    }
  });
  const key = bestZ < 0.5 ? "balanced" : bestKey;
  return { key, ...ARCHETYPES[key] };
}
