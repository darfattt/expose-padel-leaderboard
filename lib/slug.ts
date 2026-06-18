// URL-safe slug from a free-text name: lowercased, non-alphanumerics collapsed
// to single hyphens, trimmed. Used as the stable, unique handle for a club.
// Kept crypto-free (separate from lib/normalize) so client components can import it.
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
