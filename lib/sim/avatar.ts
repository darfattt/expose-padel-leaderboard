import type { Gender } from "../types";
import { hashStringToSeed, mulberry32 } from "./rng";

// A deterministic pixel-avatar spec derived purely from a name. The FIP dataset
// carries only rank/name/photo (no nationality/handedness), so we hash the name
// into stable cosmetic choices — a given person always looks identical, which is
// what makes the procedural sprite "recognisable" when paired with their label.
// Pure + framework-agnostic; the renderer (avatar-sprite.ts) draws from this spec.
//
// The cosmetic space is deliberately wide — skin × hair × kit × bottom × hair
// style × accessory × gender yields well over a hundred distinct looks (far more
// than the 16 the design called for), so a field of players reads as a varied
// crowd rather than recoloured clones.

// Hair styles: 0 short, 1 cap, 2 long, 3 bald (men); 2 long, 4 ponytail, 5 bun
// (women). The renderer (avatar-sprite.ts HAIR_BY_STYLE) draws each.
export type HairStyle = 0 | 1 | 2 | 3 | 4 | 5;

// Head accessory layered over the hair. "glasses" are the black shades.
export type Accessory = "none" | "hat" | "bandana" | "glasses" | "crown";

// Lower body: shorts (short pants) for men, a skirt (rok) for women.
export type Bottom = "shorts" | "skirt";

export interface AvatarSpec {
  skin: string;
  hair: string;
  hairStyle: HairStyle;
  kit: string; // jersey colour
  shorts: string; // shorts / skirt colour
  headband: boolean;
  stance: "Left" | "Right"; // lefty / righty (cosmetic — flips the racket hand)
  gender: Gender;
  accessory: Accessory;
  bottom: Bottom; // skirt for women ("celana rok"), shorts for men
}

const SKIN = ["#ffdbac", "#f2c6a0", "#e0a878", "#c68642", "#a0673a", "#8d5524"];
const HAIR = ["#1b1b1b", "#3b2a1a", "#6b4226", "#a8651f", "#d9b15a", "#9a9a9a", "#b5483a", "#5b3aa8"];
const KIT = ["#ff7759", "#2f9e44", "#1863dc", "#f08c00", "#7048e8", "#e8590c", "#0c8599", "#e64980"];
const SHORTS = ["#212121", "#ffffff", "#1b3a4b", "#3b3b3b", "#102a43", "#7a1f3d"];
const ACCESSORIES: Accessory[] = ["none", "none", "hat", "bandana", "glasses", "crown"];
// Men keep short/cap/bald (with the odd long mane); women always wear it long.
const M_HAIR: HairStyle[] = [0, 1, 2, 3];
const F_HAIR: HairStyle[] = [2, 4, 5];

function pick<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

// kit can be steered (e.g. tint a team's avatars toward its accent colour) via
// the optional override; gender comes from the player's profile and **defaults to
// male when null/unset** (we never guess female from the name, so a man who hasn't
// set his gender is never drawn in a skirt). Everything else is name-derived. The
// PRNG is drawn in a fixed order regardless of which overrides are supplied, so
// passing an override never desyncs the other (name-derived) traits.
export function avatarFromName(
  name: string,
  kitOverride?: string,
  gender: Gender | null = "male"
): AvatarSpec {
  const g: Gender = gender ?? "male"; // null/undefined → male
  const rng = mulberry32(hashStringToSeed(name || "?"));
  const skin = pick(SKIN, rng);
  const hair = pick(HAIR, rng);
  const kitPick = pick(KIT, rng);
  const shorts = pick(SHORTS, rng);
  const headband = rng() < 0.35;
  const stance: "Left" | "Right" = rng() < 0.5 ? "Left" : "Right";
  const accessory = pick(ACCESSORIES, rng);
  const hairStyle = pick(g === "female" ? F_HAIR : M_HAIR, rng);
  return {
    skin,
    hair,
    hairStyle,
    kit: kitOverride ?? kitPick,
    shorts,
    headband,
    stance,
    gender: g,
    accessory,
    bottom: g === "female" ? "skirt" : "shorts",
  };
}
