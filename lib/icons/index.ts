import { ICONS, type IconData } from "./data.generated";

// Thin accessor layer over the generated game-icons data. Framework-agnostic and
// pure, so it's shared by the inline-SVG component (app/components/GameIcon) and
// the canvas card renderer (lib/icons/canvas). The icon set is game-icons.net,
// used under CC BY 3.0 — see GAME_ICONS_ATTRIBUTION and the site footer credit.

export type { IconData };

// Attribution required by the CC BY 3.0 licence. Rendered in the site footer.
export const GAME_ICONS_ATTRIBUTION = "Badge & level icons by game-icons.net (CC BY 3.0)";
export const GAME_ICONS_URL = "https://game-icons.net";

export function getIcon(name: string | null | undefined): IconData | null {
  if (!name) return null;
  return ICONS[name] ?? null;
}

// A standalone <svg> string for a named icon, tinted to `color` and sized square.
// Returns "" for an unknown name so callers can fall back. Used where a full SVG
// string is needed (canvas data URLs); React components inline the body directly.
export function iconSvg(name: string, color = "currentColor", size = 24): string {
  const ic = getIcon(name);
  if (!ic) return "";
  const body = color === "currentColor" ? ic.body : ic.body.replaceAll("currentColor", color);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${ic.w} ${ic.h}">${body}</svg>`;
}
