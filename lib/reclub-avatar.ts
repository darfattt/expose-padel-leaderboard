import { unstable_cache } from "next/cache";

// Resolves a Reclub profile's avatar URL by reading it off the profile page.
// The avatar id isn't derivable from the @handle, so we fetch the public HTML
// and pull the first <img src="https://assets.reclub.co/user-avatars/{id}.webp">
// — the player's own avatar sits in the page header. Server-only (uses fetch +
// Next's Data Cache); callers in Server Components/actions await it.

const AVATAR_RE = /https:\/\/assets\.reclub\.co\/user-avatars\/\d+\.webp/;

// Cached for a day, keyed by the profile URL: the avatar rarely changes and we
// don't want to hit Reclub on every leaderboard render.
//
// IMPORTANT: only *definitive* outcomes are cached — a successful page load,
// whether or not it carried an avatar. A transient failure (network error, or a
// non-200 such as a 429 when several profiles are scraped at once) THROWS so it
// is **not** cached: unstable_cache stores resolved values (including null) for a
// full day, so caching a transient null would freeze that player on initials
// until the cache expired. Throwing lets the next render retry instead.
const resolveReclubAvatarCached = unstable_cache(
  async (profileUrl: string): Promise<string | null> => {
    const res = await fetch(profileUrl, {
      headers: { "user-agent": "Mozilla/5.0 (compatible; padel-leaderboard/1.0)" },
      next: { revalidate: 86_400 },
    });
    if (!res.ok) throw new Error(`reclub avatar fetch failed: ${res.status}`);
    const html = await res.text();
    // A 200 with no avatar in the markup is a real "this profile has none" — safe
    // to cache as null so we don't re-scrape a profile that simply lacks a photo.
    return AVATAR_RE.exec(html)?.[0] ?? null;
  },
  ["reclub-avatar"],
  { revalidate: 86_400 }
);

// Public resolver: returns null on any failure (so the UI falls back to
// initials) but, crucially, leaves transient failures **uncached** so they
// self-heal on the next render rather than sticking for a day.
export async function resolveReclubAvatar(profileUrl: string): Promise<string | null> {
  try {
    return await resolveReclubAvatarCached(profileUrl);
  } catch {
    return null;
  }
}

// A player's resolved avatar: the stored value if present, otherwise resolved
// live from the profile URL (cached). Null when the player has no Reclub link or
// resolution fails — the caller renders initials instead.
export async function avatarFor(
  reclubUrl: string | null | undefined,
  storedAvatar: string | null | undefined
): Promise<string | null> {
  if (storedAvatar) return storedAvatar;
  if (!reclubUrl) return null;
  return resolveReclubAvatar(reclubUrl);
}
