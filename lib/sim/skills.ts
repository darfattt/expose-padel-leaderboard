import type { AttributeKey, Attributes } from "../archetype";
import type { RacketPlayStyle } from "../racket-reco";

// Named special moves a character surfaces, derived from grounded inputs: the
// player's gear (racket), their Reclub kudos (the skill their peers endorse), and
// the partner pro's archetype. Each maps to a small documented modifier so
// "results follow the gear/kudos/pro" — though the match outcome itself stays
// calibrated to predictMatchup (see engine.ts); these drive *which* points get
// dramatic flashes, not who wins.
//
// Every skill carries an `fx` token — a stable, framework-agnostic string the
// canvas renderer resolves to an animation (app/versus/skill-fx.ts). Keeping it a
// plain string here means lib/ stays decoupled from the React/canvas layer while
// personalised names ("Vertex Smash") still find the right effect.
export interface Skill {
  name: string;
  source: "racket" | "pro" | "kudos";
  member: 0 | 1; // 0 = the human player, 1 = the partner pro
  effect: string; // human-readable note (also the in-sim modifier rationale)
  fx: string; // animation token → FxKind in app/versus/skill-fx.ts
}

// Racket frame → signature, keyed by play-style (lib/racket-reco.ts). `name` is
// the fallback label; when the player has a real racket set we personalise it as
// "{gear} {suffix}" (e.g. "Vertex Smash") so the move reads as *theirs*. The three
// suffixes map the frame's character onto a move: a power frame smashes, a control
// frame blocks, a balanced frame returns.
const RACKET_SKILL: Record<
  RacketPlayStyle,
  { name: string; suffix: string; effect: string; fx: string }
> = {
  power: {
    name: "Fire Serve",
    suffix: "Smash",
    effect: "A racket-fed smash — higher winner chance on attacking points.",
    fx: "cannon",
  },
  control: {
    name: "Great Wall",
    suffix: "Block",
    effect: "The frame absorbs everything — fewer cheap points conceded.",
    fx: "greatwall",
  },
  balanced: {
    name: "All-Court",
    suffix: "Return",
    effect: "A do-everything frame — a small edge returning at both ends.",
    fx: "return",
  },
};

// Partner pro's primary archetype trait → signature move.
const PRO_SKILL: Record<AttributeKey | "balanced", { name: string; effect: string; fx: string }> = {
  attack: { name: "Víbora", effect: "Whippy attacking winner from the partner pro.", fx: "vibora" },
  defense: { name: "Great Wall", effect: "The pro's wall digs out balls others can't reach.", fx: "greatwall" },
  consistency: { name: "Tornado Lob", effect: "Relentless, swirling lobs that spin the opponent around.", fx: "tornado" },
  clutch: { name: "Ice Bandeja", effect: "Cold-blooded bandeja that owns the big points.", fx: "ice" },
  win: { name: "Net Breaker", effect: "A winner so heavy it tears the net once the rally tilts their way.", fx: "netbreak" },
  balanced: { name: "Smart Play", effect: "Reads the point and picks the right shot.", fx: "smart" },
};

// Reclub endorses players with "kudos" in named skill categories. The six the
// product surfaces front-and-centre are mandatory here (volley, backhand,
// forehand, defense, return, lob); the rest are our own additions for variety.
// Each maps to a signature move + an animation the renderer plays.
export type KudosKind =
  // Mandatory — the Reclub kudos taxonomy.
  | "volley"
  | "backhand"
  | "forehand"
  | "defense"
  | "return"
  | "lob"
  // Extra — creative additions sharing the same shape.
  | "smash"
  | "bandeja"
  | "vibora"
  | "serve"
  | "speed"
  // Multi-ball signatures — an overwhelming flurry of balls at the opponent.
  | "barrage"
  | "meteor";

const KUDOS_SKILL: Record<KudosKind, { name: string; effect: string; fx: string }> = {
  volley: {
    name: "Net Storm",
    effect: "A flurry of reflex volleys — quick hands punch it away at the tape.",
    fx: "volley",
  },
  backhand: {
    name: "Backhand Whip",
    effect: "A whipped backhand cross that curls away from the reach.",
    fx: "backhand",
  },
  forehand: {
    name: "Forehand Drive",
    effect: "A flat forehand drive that scorches a line straight through them.",
    fx: "forehand",
  },
  defense: {
    name: "Great Wall",
    effect: "An immovable defence — every ball comes back off the wall.",
    fx: "greatwall",
  },
  return: {
    name: "Counter Return",
    effect: "Reads the serve and rifles the return straight back as a winner.",
    fx: "return",
  },
  lob: {
    name: "Tornado Lob",
    effect: "A towering lob that spins the opponent berputar-putar.",
    fx: "tornado",
  },
  smash: {
    name: "Cannon Smash",
    effect: "A flattening overhead — the cannonball detonates on contact.",
    fx: "cannon",
  },
  bandeja: {
    name: "Ice Bandeja",
    effect: "A cold-blooded bandeja that freezes the rally on the big points.",
    fx: "ice",
  },
  vibora: {
    name: "Víbora",
    effect: "A whippy víbora that snaps in with vicious sidespin.",
    fx: "vibora",
  },
  serve: {
    name: "Fire Serve",
    effect: "A blazing serve that erupts on the bounce.",
    fx: "fireserve",
  },
  speed: {
    name: "Blur Dash",
    effect: "Covers every blade of court — gone before the ball lands.",
    fx: "allcourt",
  },
  barrage: {
    name: "Ball Barrage",
    effect: "A relentless storm of balls hammered one after another — nowhere to hide.",
    fx: "barrage",
  },
  meteor: {
    name: "Meteor Shower",
    effect: "A rain of overheads crashing down from every angle at once.",
    fx: "meteor",
  },
};

// A player's signature Reclub kudos, derived deterministically from the grounded
// profile (archetype + display attributes + computed play-style) — we have no live
// kudos feed, so the strongest read of their game stands in for what their peers
// would endorse. Covers all six mandatory categories plus the bandeja/smash extras.
export function signatureKudos(
  attrs: Attributes,
  primary: AttributeKey | "balanced",
  style: RacketPlayStyle | null
): KudosKind {
  const { attack, defense, consistency, clutch } = attrs;
  // A genuine defensive specialist walls up.
  if (primary === "defense" || defense > attack + 12) return "defense";
  // Clutch finishers own the net and the big points.
  if (primary === "clutch") return clutch >= 70 ? "bandeja" : "volley";
  // Steady players craft the point — lobs when they have the patience, else a
  // reliable counter return.
  if (primary === "consistency") return consistency >= 60 ? "lob" : "return";
  // Attackers and closers: a power frame smashes; otherwise a flat finisher drives
  // the forehand, while a spin-first attacker whips the backhand. The truly
  // overwhelming attackers graduate to a multi-ball signature.
  if (primary === "attack" || primary === "win") {
    if (style === "power") {
      // A dominant power attacker buries the opponent under a barrage of balls.
      if (attack >= 85 && clutch >= 70) return "barrage";
      return "smash";
    }
    // A devastating all-round finisher calls down a meteor shower of overheads.
    if (attack >= 80 && clutch >= 80) return "meteor";
    return clutch >= consistency ? "forehand" : "backhand";
  }
  // Balanced all-courters: a control frame returns, otherwise they live at the net.
  return style === "control" ? "return" : "volley";
}

// A compact, on-court moniker for a racket, for personalised skill names. Drops a
// leading brand if it just repeats, then keeps the first couple of model tokens so
// "Bullpadel Vertex 04 Air" → "Vertex 04" reads cleanly on the flash label.
export function gearMoniker(racketName: string, racketBrand?: string | null): string {
  let n = racketName.trim();
  if (racketBrand) {
    const b = racketBrand.trim();
    if (b && n.toLowerCase().startsWith(b.toLowerCase())) n = n.slice(b.length).trim();
  }
  const tokens = n.split(/\s+/).filter(Boolean);
  const moniker = tokens.slice(0, 2).join(" ");
  return moniker || racketName.trim();
}

// 1–3 skills per character. The racket skill only appears when the player has a
// racket set (gear is optional → degrade to just the pro signature); when present
// and given a `gearMoniker` it is personalised ("Vertex Smash"). The pro signature
// always shows. A kudos signature (the player's endorsed move) adds a third when
// `kudos` is supplied. `style` is the player's computed play-style; pass null to
// suppress the racket skill entirely.
export function teamSkills(
  style: RacketPlayStyle | null,
  proPrimary: AttributeKey | "balanced",
  opts?: { gearMoniker?: string | null; kudos?: KudosKind }
): Skill[] {
  const skills: Skill[] = [];
  if (style) {
    const r = RACKET_SKILL[style];
    const moniker = opts?.gearMoniker?.trim();
    skills.push({
      name: moniker ? `${moniker} ${r.suffix}` : r.name,
      source: "racket",
      member: 0,
      effect: r.effect,
      fx: r.fx,
    });
  }
  const p = PRO_SKILL[proPrimary] ?? PRO_SKILL.balanced;
  skills.push({ name: p.name, source: "pro", member: 1, effect: p.effect, fx: p.fx });
  if (opts?.kudos) {
    const k = KUDOS_SKILL[opts.kudos];
    // Don't surface a kudos move that just duplicates the racket move's name.
    if (!skills.some((s) => s.name === k.name)) {
      skills.push({ name: k.name, source: "kudos", member: 0, effect: k.effect, fx: k.fx });
    }
  }
  return skills;
}
