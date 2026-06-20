import { getIcon } from "./index";

// Rasterises game-icons glyphs into <img> elements for the canvas share-card
// renderer (lib/share/card.ts). Canvas can't draw an SVG string directly, so each
// icon is turned into a tinted data-URL image once and cached. The card flow is:
// collect the icon names a spec uses → preloadIcons() → draw with getCachedIcon().
// Client-only (touches Image); import only from client code.

const cache = new Map<string, HTMLImageElement>();

const keyOf = (name: string, color: string) => `${name}@${color}`;

function buildImage(name: string, color: string): HTMLImageElement | null {
  const ic = getIcon(name);
  if (!ic) return null;
  const body = ic.body.replaceAll("currentColor", color);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ic.w} ${ic.h}" width="${ic.w}" height="${ic.h}">${body}</svg>`;
  const img = new Image(ic.w, ic.h);
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  return img;
}

// Resolve once the image has decoded (or immediately if cached/decoded). Resolves
// null for an unknown icon name so callers simply skip drawing it.
export function loadIcon(name: string, color: string): Promise<HTMLImageElement | null> {
  const key = keyOf(name, color);
  const cached = cache.get(key);
  if (cached) return cached.complete ? Promise.resolve(cached) : decoded(cached);
  const img = buildImage(name, color);
  if (!img) return Promise.resolve(null);
  cache.set(key, img);
  return decoded(img);
}

function decoded(img: HTMLImageElement): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    if (img.complete && img.naturalWidth > 0) resolve(img);
  });
}

export async function preloadIcons(reqs: { name: string; color: string }[]): Promise<void> {
  await Promise.all(reqs.map((r) => loadIcon(r.name, r.color)));
}

// Synchronous lookup for the draw pass — assumes preloadIcons() already ran for
// this name+color. Returns null when not loaded so the renderer skips it cleanly.
export function getCachedIcon(name: string, color: string): HTMLImageElement | null {
  const img = cache.get(keyOf(name, color));
  return img && img.complete && img.naturalWidth > 0 ? img : null;
}
