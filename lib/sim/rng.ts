// Deterministic, seedable PRNG for the match simulation. Same seed → same
// stream → same match, so a head-to-head cartoon is reproducible (and a future
// "share this match" link is trivial). Pure + framework-agnostic like the rest
// of lib/: never reads Date.now()/Math.random().

// mulberry32: a tiny, fast 32-bit PRNG. Returns a function yielding floats in
// [0, 1). Good enough for cosmetic rally drama; not cryptographic.
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Stable 32-bit hash of a string → an unsigned seed. Same approach as
// proAvatarColor (lib/pros.ts) so seeding is consistent across the codebase.
export function hashStringToSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) >>> 0;
  return h >>> 0;
}
