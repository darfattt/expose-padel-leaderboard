import type { Attributes } from "./archetype";

// Maps a read-time player profile (rating + display attributes) onto the inputs
// the Padelful recommendations API accepts, so a racket suggestion tracks the
// exact numbers shown on the radar. See https://docs.padelful.com/api/recommendations
//
// Pure on purpose (no fetch here) so the mapping is unit-testable; the network
// call lives in app/actions/player.ts alongside the other Padelful fetches.

export type RacketLevel = "beginner" | "intermediate" | "advanced";
export type RacketPlayStyle = "control" | "power" | "balanced";

export interface RacketCriteria {
  level: RacketLevel;
  playStyle: RacketPlayStyle;
}

// One racket pick from POST /api/v1/recommendations, trimmed to what we render.
export interface RacketRecommendation {
  slug: string;
  model: string;
  brand: string;
  shape: string | null;
  feel: string | null;
  rating: string | null; // Padelful's own 0–10 review score
  price: number | null; // pvp, EUR
  image: string | null; // absolute product-shot URL
  url: string | null; // absolute padelful.com URL
  matchReason: string;
}

// Collapse the seven Playtomic bands (lib/levels.ts) onto the API's three:
// < 3.5 beginner · 3.5–6.5 intermediate · >= 6.5 advanced. These cut points
// line up with the Intermediate/Upper-Intermediate boundaries in LEVELS.
export function racketLevel(rating: number): RacketLevel {
  if (rating < 3.5) return "beginner";
  if (rating < 6.5) return "intermediate";
  return "advanced";
}

// A clear gap either way picks a side; a near-tie stays balanced.
const STYLE_GAP = 12;

// Power vs control comes straight off the radar: the "Power" (attack) axis
// against the "Consistency" axis, both 0–100. A scoreboard-dominant player
// leans power; a steady, low-variance player leans control.
export function racketPlayStyle(a: Attributes): RacketPlayStyle {
  const diff = a.attack - a.consistency;
  if (diff >= STYLE_GAP) return "power";
  if (diff <= -STYLE_GAP) return "control";
  return "balanced";
}

export function racketCriteria(rating: number, a: Attributes): RacketCriteria {
  return { level: racketLevel(rating), playStyle: racketPlayStyle(a) };
}
