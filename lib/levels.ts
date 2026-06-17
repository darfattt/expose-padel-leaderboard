// Playtomic skill levels for a 0.0–7.0 performance rating.
//
// Playtomic rates padel players on a 0–7 scale (0 = just started, 7 = world-tour
// professional). The rating (see lib/rating.ts) is field-relative — ~3.5 is
// mid-field — so these bands map a player's performance onto that recognised
// ladder of categories and badges. Reference: https://playtomic.com/blog/padel-levels
//
// Colors are kept as hex here (not Tailwind classes) because lib/ is outside
// the Tailwind content glob; components apply them via inline style.

export interface Level {
  key: string;
  category: string; // Playtomic-style category name
  badge: string; // emoji badge
  min: number; // inclusive lower bound on the 0–7 rating
  max: number; // upper bound (inclusive only on the top band)
  description: string;
  color: string; // accent hex for badge text/border
}

// Ordered low → high in 0.5 steps across Playtomic's 0–7 ladder, each step its
// own named band. Wording follows Playtomic's official level descriptions
// (Initiation → Intermediate → Intermediate High → Intermediate Advanced →
// Advanced → Elite). Bands are [min, max), except the top band which is closed
// so a perfect 7.0 still lands in "Professional".
export const LEVELS: Level[] = [
  {
    key: "newcomer",
    category: "Newcomer",
    badge: "🌱",
    min: 0,
    max: 0.5,
    description: "Brand new — has never picked up a padel racket.",
    color: "#8a8a99",
  },
  {
    key: "starter",
    category: "Starter",
    badge: "🐣",
    min: 0.5,
    max: 1,
    description: "Under six months in; no real technique or tactics yet.",
    color: "#75758a",
  },
  {
    key: "rookie",
    category: "Rookie",
    badge: "🎾",
    min: 1,
    max: 1.5,
    description: "Around a year in; still building the very basics.",
    color: "#5a9e6a",
  },
  {
    key: "rallyer",
    category: "Rallyer",
    badge: "🏓",
    min: 1.5,
    max: 2,
    description: "Can rally and return, but only at a gentle pace.",
    color: "#2f9e44",
  },
  {
    key: "improver",
    category: "Improver",
    badge: "🔰",
    min: 2,
    max: 2.5,
    description: "A season of play; steady low-speed exchanges.",
    color: "#2b8a7a",
  },
  {
    key: "shotmaker",
    category: "Shotmaker",
    badge: "🔹",
    min: 2.5,
    max: 3,
    description: "Most strokes under control at a normal pace.",
    color: "#1c9bd6",
  },
  {
    key: "driver",
    category: "Driver",
    badge: "🟦",
    min: 3,
    max: 3.5,
    description: "Drives the ball flat, but with many unforced errors.",
    color: "#1863dc",
  },
  {
    key: "director",
    category: "Director",
    badge: "🎯",
    min: 3.5,
    max: 4,
    description: "Slice and flat shots, directing the ball — still error-prone.",
    color: "#3a5bd9",
  },
  {
    key: "controller",
    category: "Controller",
    badge: "🔶",
    min: 4,
    max: 4.5,
    description: "Controls direction and depth with few unforced errors.",
    color: "#f08c00",
  },
  {
    key: "tactician",
    category: "Tactician",
    badge: "🧠",
    min: 4.5,
    max: 5,
    description: "Puts the ball deep, but still struggles to finish points.",
    color: "#e8730a",
  },
  {
    key: "competitor",
    category: "Competitor",
    badge: "🏅",
    min: 5,
    max: 5.5,
    description: "Solid technique and tactics; ready for good-pace matches.",
    color: "#ff7759",
  },
  {
    key: "contender",
    category: "Contender",
    badge: "⚔️",
    min: 5.5,
    max: 6,
    description: "Commands pace and tactics in high-tempo matches.",
    color: "#f0455a",
  },
  {
    key: "elite",
    category: "Elite",
    badge: "💎",
    min: 6,
    max: 6.5,
    description: "Powerful and controlled; reads and dismantles the game.",
    color: "#7048e8",
  },
  {
    key: "professional",
    category: "Professional",
    badge: "👑",
    min: 6.5,
    max: 7,
    description: "Top-tier, WPT-level command of every shot.",
    color: "#17171c",
  },
];

// Resolve a 0–7 rating to its level band. Clamps out-of-range inputs so the
// lookup always returns a band.
export function levelForRating(rating: number): Level {
  const r = Math.min(7, Math.max(0, rating));
  return LEVELS.find((l) => r >= l.min && r < l.max) ?? LEVELS[LEVELS.length - 1];
}
