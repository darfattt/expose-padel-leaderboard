import type { AttributeKey } from "../archetype";
import type { RacketPlayStyle } from "../racket-reco";

// Named special moves a character surfaces, derived from grounded inputs: the
// player's gear (racket play-style) and the partner pro's archetype. Each maps
// to a small documented modifier so "results follow the gear/pro" — though the
// match outcome itself stays calibrated to predictMatchup (see engine.ts); these
// drive *which* points get dramatic flashes, not who wins.
export interface Skill {
  name: string;
  source: "racket" | "pro";
  member: 0 | 1; // 0 = the human player, 1 = the partner pro
  effect: string; // human-readable note (also the in-sim modifier rationale)
}

// Racket frame → signature, keyed by play-style (lib/racket-reco.ts).
const RACKET_SKILL: Record<RacketPlayStyle, { name: string; effect: string }> = {
  power: { name: "Cannon Smash", effect: "Higher winner chance on attacking points." },
  control: { name: "Wall Defense", effect: "Better retrieval — concedes fewer cheap points." },
  balanced: { name: "All-Court", effect: "A small edge at both ends of the court." },
};

// Partner pro's primary archetype trait → signature move.
const PRO_SKILL: Record<AttributeKey | "balanced", { name: string; effect: string }> = {
  attack: { name: "Víbora", effect: "Whippy attacking winner from the partner pro." },
  defense: { name: "Wall Defense", effect: "The pro digs out balls others can't reach." },
  consistency: { name: "Metronome Lob", effect: "Relentless, low-error lobbing resets the point." },
  clutch: { name: "Ice Bandeja", effect: "Cold-blooded bandeja that owns the big points." },
  win: { name: "Closer Instinct", effect: "Finds the finish once the rally tilts their way." },
  balanced: { name: "Smart Play", effect: "Reads the point and picks the right shot." },
};

// 1–2 skills per character. The racket skill only appears when the player has a
// racket set (gear is optional → degrade to just the pro signature). The pro
// signature always shows. `style` is the player's computed play-style; pass null
// to suppress the racket skill entirely.
export function teamSkills(style: RacketPlayStyle | null, proPrimary: AttributeKey | "balanced"): Skill[] {
  const skills: Skill[] = [];
  if (style) {
    const r = RACKET_SKILL[style];
    skills.push({ name: r.name, source: "racket", member: 0, effect: r.effect });
  }
  const p = PRO_SKILL[proPrimary] ?? PRO_SKILL.balanced;
  skills.push({ name: p.name, source: "pro", member: 1, effect: p.effect });
  return skills;
}
