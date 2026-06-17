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

// Collapse the Playtomic level bands (lib/levels.ts) onto the API's three:
// < 2.5 beginner · 2.5–5 intermediate · >= 5 advanced. The cuts sit at Playtomic
// tier edges on the 0–7 scale — below the Intermediate tier (2.5) and at the
// Competitor/Advanced threshold (5.0).
export function racketLevel(rating: number): RacketLevel {
  if (rating < 2.5) return "beginner";
  if (rating < 5) return "intermediate";
  return "advanced";
}

// A clear gap either way picks a side; a near-tie stays balanced.
const STYLE_GAP = 12;

// Clutch feeds the power score, but only above average and at reduced weight:
// in this app's own model a strong finisher reads as clutch+power ("The
// Finisher"), so above-average clutch nudges toward a power frame. Below-average
// clutch says nothing about control, so it never subtracts (one-directional).
const CLUTCH_WEIGHT = 0.4;

// Power vs control comes off the radar. The power score blends the "Power"
// (attack) axis with an above-average "Clutch" (finishing) bonus; the control
// score is the "Consistency" axis. Defense is deliberately left out — in
// fixed-sum games it mirrors attack (see lib/archetype.ts) so it adds no
// independent signal. A scoreboard-dominant or clinical-finishing player leans
// power; a steady, low-variance player leans control.
export function racketPlayStyle(a: Attributes): RacketPlayStyle {
  const power = a.attack + CLUTCH_WEIGHT * Math.max(0, a.clutch - 50);
  const diff = power - a.consistency;
  if (diff >= STYLE_GAP) return "power";
  if (diff <= -STYLE_GAP) return "control";
  return "balanced";
}

export function racketCriteria(rating: number, a: Attributes): RacketCriteria {
  return { level: racketLevel(rating), playStyle: racketPlayStyle(a) };
}

// Lowercase style word for mid-sentence microcopy.
const STYLE_WORD: Record<RacketPlayStyle, string> = {
  power: "power",
  control: "control",
  balanced: "balanced",
};

// One grounded line tying the recommended frames back to the player's own
// numbers — turns the picks from a catalogue slice into an explanation.
export function playStyleBlurb(style: RacketPlayStyle): string {
  switch (style) {
    case "power":
      return "Power frames to match your attacking edge.";
    case "control":
      return "Control frames to match your steady, low-error game.";
    case "balanced":
      return "Balanced frames — power and control in equal measure.";
  }
}

// Padelful racket shapes map onto the same power/control axis: diamond frames
// are power-biased (weight high), round frames control-biased (weight low),
// teardrop/hybrid sit in between. Returns null for an unknown/absent shape so
// the contrast simply isn't drawn.
export function shapeToStyle(shape: string | null): RacketPlayStyle | null {
  if (!shape) return null;
  const s = shape.toLowerCase();
  if (s.includes("diamond")) return "power";
  if (s.includes("round")) return "control";
  if (s.includes("teardrop") || s.includes("drop") || s.includes("hybrid")) return "balanced";
  return null;
}

// Coaching line contrasting the player's computed style against the frame they
// actually own. Matches → reassurance; mismatch → why these picks fit better.
// Returns null when the owned racket's style is unknown (nothing useful to say).
export function ownedRacketContrast(
  playerStyle: RacketPlayStyle,
  ownedStyle: RacketPlayStyle | null,
  ownedName: string
): string | null {
  if (!ownedStyle) return null;
  if (ownedStyle === playerStyle) {
    return `Your ${ownedName} already suits your ${STYLE_WORD[playerStyle]} game.`;
  }
  return `You play ${STYLE_WORD[playerStyle]}, but your ${ownedName} leans ${STYLE_WORD[ownedStyle]} — these picks fit your game better.`;
}
