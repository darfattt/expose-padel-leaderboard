// Loads remote photos — the player's Reclub avatar and Padelful racket shots —
// for the canvas share card. Critically uses crossOrigin="anonymous": both hosts
// send `Access-Control-Allow-Origin: *`, so the image draws onto the canvas
// WITHOUT tainting it and toBlob()/export still works. If a host ever omits CORS
// (or the image 404s), the load errors and we resolve null so the card falls back
// — the 8-bit sprite for the avatar, a racket icon for the gear — instead of
// throwing on export. Client-only (touches Image); import from client code.

const cache = new Map<string, HTMLImageElement | null>();

export function loadPhoto(url: string): Promise<HTMLImageElement | null> {
  if (cache.has(url)) return Promise.resolve(cache.get(url) ?? null);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      cache.set(url, img);
      resolve(img);
    };
    img.onerror = () => {
      cache.set(url, null); // remember the miss for this session so we don't retry per-render
      resolve(null);
    };
    img.src = url;
  });
}

export async function preloadPhotos(urls: (string | null | undefined)[]): Promise<void> {
  await Promise.all(urls.filter((u): u is string => !!u).map(loadPhoto));
}

// Synchronous lookup for the draw pass — assumes preloadPhotos() already ran.
// Returns null when not loaded or the load failed, so the renderer skips it.
export function getCachedPhoto(url: string | null | undefined): HTMLImageElement | null {
  if (!url) return null;
  const img = cache.get(url);
  return img && img.complete && img.naturalWidth > 0 ? img : null;
}
