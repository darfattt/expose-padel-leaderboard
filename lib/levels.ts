// Playtomic-style skill levels for a 0.0–10.0 performance rating.
//
// The rating (see lib/rating.ts) is field-relative — ~5.0 is mid-field — so
// these bands map a player's performance onto the recognised Playtomic ladder
// of categories and badges. Reference: https://playtomic.com/blog/padel-levels
//
// Colors are kept as hex here (not Tailwind classes) because lib/ is outside
// the Tailwind content glob; components apply them via inline style.

export interface Level {
  key: string;
  category: string; // Playtomic-style category name
  badge: string; // emoji badge
  min: number; // inclusive lower bound on the 0–10 rating
  max: number; // upper bound (inclusive only on the top band)
  description: string;
  color: string; // accent hex for badge text/border
}

// Ordered low → high. Bands are [min, max), except the top band which is closed
// so a perfect 10.0 still lands in "Professional".
export const LEVELS: Level[] = [
  {
    key: "beginner",
    category: "Beginner",
    badge: "🌱",
    min: 0,
    max: 2,
    description: "Just starting out — learning grip, serve, and the basics.",
    color: "#75758a",
  },
  {
    key: "improver",
    category: "Improver",
    badge: "🎾",
    min: 2,
    max: 3.5,
    description: "Developing consistency, court positioning, and rallying.",
    color: "#2f9e44",
  },
  {
    key: "intermediate",
    category: "Intermediate",
    badge: "🔹",
    min: 3.5,
    max: 5,
    description: "Comfortable in rallies, with growing tactical awareness.",
    color: "#1863dc",
  },
  {
    key: "upper-intermediate",
    category: "Upper Intermediate",
    badge: "🔶",
    min: 5,
    max: 6.5,
    description: "Confident tactical play; controls pace and placement.",
    color: "#f08c00",
  },
  {
    key: "advanced",
    category: "Advanced",
    badge: "🚀",
    min: 6.5,
    max: 8,
    description: "High control, strategy, and real match experience.",
    color: "#ff7759",
  },
  {
    key: "expert",
    category: "Expert",
    badge: "💎",
    min: 8,
    max: 9,
    description: "Tournament-level command of every shot and situation.",
    color: "#7048e8",
  },
  {
    key: "professional",
    category: "Professional",
    badge: "👑",
    min: 9,
    max: 10,
    description: "Competes at national and international level.",
    color: "#17171c",
  },
];

// Resolve a 0–10 rating to its level band. Clamps out-of-range inputs so the
// lookup always returns a band.
export function levelForRating(rating: number): Level {
  const r = Math.min(10, Math.max(0, rating));
  return LEVELS.find((l) => r >= l.min && r < l.max) ?? LEVELS[LEVELS.length - 1];
}
