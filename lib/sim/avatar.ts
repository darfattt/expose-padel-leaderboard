import { hashStringToSeed, mulberry32 } from "./rng";

// A deterministic pixel-avatar spec derived purely from a name. The FIP dataset
// carries only rank/name/photo (no nationality/handedness), so we hash the name
// into stable cosmetic choices — a given person always looks identical, which is
// what makes the procedural sprite "recognisable" when paired with their label.
// Pure + framework-agnostic; the renderer (MatchSim.tsx) draws from this spec.
export interface AvatarSpec {
  skin: string;
  hair: string;
  hairStyle: 0 | 1 | 2 | 3; // short / cap / long / bald
  kit: string; // jersey colour
  shorts: string;
  headband: boolean;
  stance: "L" | "R"; // lefty / righty (cosmetic — flips the racket hand)
}

const SKIN = ["#f2c6a0", "#e0a878", "#c68642", "#8d5524", "#ffdbac"];
const HAIR = ["#1b1b1b", "#3b2a1a", "#6b4226", "#a8651f", "#d9b15a", "#9a9a9a"];
const KIT = ["#ff7759", "#2f9e44", "#1863dc", "#f08c00", "#7048e8", "#e8590c", "#0c8599", "#e64980"];
const SHORTS = ["#212121", "#ffffff", "#1b3a4b", "#3b3b3b", "#102a43"];

function pick<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

// kit can be steered (e.g. tint a team's avatars toward its accent colour) via
// the optional override; everything else is name-derived.
export function avatarFromName(name: string, kitOverride?: string): AvatarSpec {
  const rng = mulberry32(hashStringToSeed(name || "?"));
  return {
    skin: pick(SKIN, rng),
    hair: pick(HAIR, rng),
    hairStyle: Math.floor(rng() * 4) as 0 | 1 | 2 | 3,
    kit: kitOverride ?? pick(KIT, rng),
    shorts: pick(SHORTS, rng),
    headband: rng() < 0.4,
    stance: rng() < 0.5 ? "L" : "R",
  };
}
