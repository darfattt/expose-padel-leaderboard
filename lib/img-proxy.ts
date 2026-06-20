// Wrap a remote image URL so it streams through our own origin (/api/img),
// making it CORS-clean for <canvas> export. Pro headshots (www.padelfip.com)
// don't send Access-Control-Allow-Origin, so drawing them onto the share card
// requires this proxy. Same-origin and already-proxied URLs pass through
// untouched. Pure string shaping — safe to import anywhere.
export function proxiedImage(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("/")) return url; // same-origin already
  return `/api/img?url=${encodeURIComponent(url)}`;
}
