// Rating "rust": a gentle penalty for not having played recently. The competitive
// rating (lib/rating.ts) measures proven skill from the whole field; decay overlays
// *current freshness* on top of it, so a player who stops showing up gradually
// slides down the live board until they return and knock the rust off. Pure and
// clock-free — the caller passes the reference date ("as of") — so it stays
// unit-testable like the rest of lib/.

// A full month off the court costs nothing — recreational players miss weeks.
export const DECAY_GRACE_DAYS = 30;
// Rating points shed per inactive day once past the grace window. 0.005/day works
// out to ~0.15 per extra month, so the slide is slow and recoverable.
export const DECAY_PER_DAY = 0.005;
// Never shave more than this off, however long someone's been away — a returning
// player is rusty, not reset to zero.
export const DECAY_MAX = 1.0;

// Whole days between two yyyy-mm-dd dates (asOf − lastPlayed), floored at 0.
// null when either date is missing/unparseable — there's nothing to measure, so
// such a player is treated as fresh (no penalty).
export function inactivityDays(lastPlayed: string | null, asOf: string): number | null {
  if (!lastPlayed) return null;
  const last = Date.parse(lastPlayed);
  const now = Date.parse(asOf);
  if (Number.isNaN(last) || Number.isNaN(now)) return null;
  return Math.max(0, Math.floor((now - last) / 86_400_000));
}

// Rating points to subtract for a given inactivity length: nothing within the
// grace window, then linear, capped at DECAY_MAX. Rounded to one decimal to match
// the rating's own precision.
export function decayPenalty(days: number | null): number {
  if (days === null || days <= DECAY_GRACE_DAYS) return 0;
  const raw = (days - DECAY_GRACE_DAYS) * DECAY_PER_DAY;
  return Math.min(DECAY_MAX, Math.round(raw * 10) / 10);
}

// Apply the penalty to a rating, floored at 0 and rounded to one decimal. A fresh
// (or undated) player's rating passes through untouched.
export function applyDecay(rating: number, days: number | null): number {
  const penalty = decayPenalty(days);
  if (penalty === 0) return rating;
  return Math.max(0, Math.round((rating - penalty) * 10) / 10);
}
