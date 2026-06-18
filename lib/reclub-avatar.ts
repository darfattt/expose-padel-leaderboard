import { unstable_cache } from "next/cache";

// Resolves a Reclub profile's avatar URL by reading it off the profile page.
// The avatar id isn't derivable from the @handle, so we fetch the public HTML
// and pull the first <img src="https://assets.reclub.co/user-avatars/{id}.webp">
// — the player's own avatar sits in the page header. Server-only (uses fetch +
// Next's Data Cache); callers in Server Components/actions await it.

const AVATAR_RE = /https:\/\/assets\.reclub\.co\/user-avatars\/\d+\.webp/;

// Cached for a day, keyed by the profile URL: the avatar rarely changes and we
// don't want to hit Reclub on every leaderboard render. Returns null on any
// failure (network, non-200, no avatar in the markup) so the UI falls back to
// initials.
export const resolveReclubAvatar = unstable_cache(
  async (profileUrl: string): Promise<string | null> => {
    try {
      const res = await fetch(profileUrl, {
        headers: { "user-agent": "Mozilla/5.0 (compatible; padel-leaderboard/1.0)" },
        next: { revalidate: 86_400 },
      });
      if (!res.ok) return null;
      const html = await res.text();
      return AVATAR_RE.exec(html)?.[0] ?? null;
    } catch {
      return null;
    }
  },
  ["reclub-avatar"],
  { revalidate: 86_400 }
);

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
