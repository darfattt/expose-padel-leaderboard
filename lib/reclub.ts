// Reclub profile helpers — pure and client-safe (no server-only imports), so
// both Server Components and the editor/avatar Client Components can share them.
// A Reclub profile lives at https://reclub.co/<locale>/players/@<handle>; its
// avatar is hosted at https://assets.reclub.co/user-avatars/<id>.webp, where the
// numeric id is NOT derivable from the handle — it has to be read off the
// profile page (see lib/reclub-avatar.ts).

// Canonical form we store/display. The locale segment (id/en/…) is preserved as
// given; we only validate the shape and tidy whitespace/trailing slashes.
const PROFILE_RE = /^https?:\/\/reclub\.co\/([a-z]{2})\/players\/@([A-Za-z0-9._-]+)\/?$/i;
// A bare handle the user might paste instead of a full URL ("@darfat-41" or
// "darfat-41"). Defaults to the Indonesian locale, which is what this league uses.
const HANDLE_RE = /^@?([A-Za-z0-9._-]+)$/;

// Normalize free-form input into the canonical profile URL, or null if it
// doesn't look like a Reclub profile. Accepts a full URL or a bare @handle.
export function normalizeReclubUrl(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;

  const url = PROFILE_RE.exec(raw);
  if (url) return `https://reclub.co/${url[1].toLowerCase()}/players/@${url[2]}`;

  // Bare handle (no scheme, no slashes) → assume the league's "id" locale.
  if (!raw.includes("/") && HANDLE_RE.test(raw)) {
    const handle = HANDLE_RE.exec(raw)![1];
    return `https://reclub.co/id/players/@${handle}`;
  }
  return null;
}

// The @handle for display ("@darfat-41"), or null if the URL isn't a profile.
export function reclubHandle(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = PROFILE_RE.exec(url.trim());
  return m ? `@${m[2]}` : null;
}

// 1–2 letter initials for the avatar fallback. Uses the first letters of the
// first two words; falls back to the first two characters of a single word.
export function initialsFromName(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}
