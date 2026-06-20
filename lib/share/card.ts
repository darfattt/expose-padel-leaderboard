// A declarative, reusable share-card renderer. Features describe *what* to draw
// (a CardSpec) and this module draws it to an off-screen <canvas> in the
// Cohere-inspired house style (white body, dark-green header band, coral
// accents). Generalised from the tournament run card so Match Night recaps,
// Power Rankings and Padel Wrapped all share one branded look.
//
// DOM-dependent (it touches `document`/`canvas`), so import only from client
// components. Pure of any network/Supabase concerns.

import { drawAvatar } from "@/app/versus/avatar-sprite";
import { getCachedIcon } from "@/lib/icons/canvas";
import { getCachedPhoto } from "@/lib/share/photo";
import type { AvatarSpec } from "@/lib/sim/avatar";

export const BRAND = {
  green: "#003c33",
  coral: "#ff7759",
  ink: "#212121",
  muted: "#93939f",
  amber: "#f5c518",
  mint: "#7fe6cf",
} as const;

const FONT_DISPLAY = "'Space Grotesk', Inter, system-ui, sans-serif";
const FONT_MONO = "ui-monospace, monospace";
const FONT_BODY = "Inter, system-ui, sans-serif";

// One line in the body of a card. `tag` is a small mono label on the left
// (a round name, rank, emoji), `value` a mono figure pinned to the right (a
// score, a delta). `accent` tints tag + value with the brand green/coral pair.
export interface CardRow {
  tag?: string;
  tagColor?: string;
  icon?: string; // game-icons.net name; drawn in the left gutter in place of `tag`
  title: string;
  subtitle?: string;
  value?: string;
  valueColor?: string;
  accent?: boolean;
}

// A single oversized stat, centred under the headline — used for Wrapped panels
// where one number is the whole story.
export interface CardHero {
  value: string;
  label: string;
}

// Gear strip at the foot of a personal card — the player's racket as a product
// shot, named, with their on-court side. Makes a shared card read like a profile.
export interface CardGear {
  racketUrl?: string | null; // Padelful product shot (drawn CORS-safe, falls back to an icon)
  racketName?: string | null;
  racketBrand?: string | null;
  position?: string | null; // "Left" | "Right" | "Both"
}

export interface CardSpec {
  kicker: string; // small uppercase mono label in the header band
  title: string; // the big header line (player or event name)
  pill?: { text: string; color: string } | null; // status chip, top-right
  avatar?: AvatarSpec | null; // 8-bit pixel sprite drawn in the header (single-subject cards)
  photoUrl?: string | null; // a real player photo (Reclub) — drawn over the sprite when it loads
  gear?: CardGear | null; // racket strip above the footer
  headline?: string; // a sentence under the header
  hero?: CardHero | null;
  rows?: CardRow[];
  footer?: string; // defaults to the site wordmark
}

// Whether a gear strip has anything worth drawing.
function hasGear(spec: CardSpec): boolean {
  return !!spec.gear && !!(spec.gear.racketName || spec.gear.racketUrl);
}

// The tint a row's left glyph (icon or tag) is drawn in — kept in one place so the
// pre-render icon preload (collectCardIcons) and the draw pass agree on colour.
function rowGlyphColor(r: CardRow): string {
  return r.tagColor ?? (r.accent ? BRAND.green : BRAND.muted);
}

// Every (icon name, colour) a spec will draw — fed to preloadIcons() before
// renderCard so the synchronous draw pass can pull decoded images from the cache.
export function collectCardIcons(spec: CardSpec): { name: string; color: string }[] {
  const icons = (spec.rows ?? [])
    .filter((r) => r.icon)
    .map((r) => ({ name: r.icon as string, color: rowGlyphColor(r) }));
  // Fallback glyph for the gear strip when the racket photo can't be drawn.
  if (hasGear(spec)) icons.push({ name: "ping-pong-bat", color: BRAND.green });
  return icons;
}

const W = 1080;
const PAD = 56;
const HEADER_H = 150;
const HEADLINE_H = 60;
const HERO_H = 150;
const ROW_H = 64;
const ROW_H_SUB = 88;
const GEAR_H = 132;
const FOOTER_H = 80;
const DEFAULT_FOOTER = "expose.padel-leaderboard";

function rowHeight(r: CardRow): number {
  return r.subtitle ? ROW_H_SUB : ROW_H;
}

// Total canvas height is derived from the spec so cards grow with their content.
function cardHeight(spec: CardSpec): number {
  let h = HEADER_H + 28; // header band + breathing room
  if (spec.headline) h += HEADLINE_H;
  if (spec.hero) h += HERO_H;
  const rows = spec.rows ?? [];
  h += rows.reduce((sum, r) => sum + rowHeight(r), 0);
  if (hasGear(spec)) h += GEAR_H;
  h += FOOTER_H;
  return Math.max(h, HEADER_H + 220);
}

// Render the spec to a fresh off-screen canvas.
export function renderCard(spec: CardSpec): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = cardHeight(spec);
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  // Body.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, canvas.height);

  // Header band.
  ctx.fillStyle = BRAND.green;
  ctx.fillRect(0, 0, W, HEADER_H);

  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.font = `600 22px ${FONT_MONO}`;
  ctx.fillText(spec.kicker.toUpperCase(), PAD, 56);

  ctx.fillStyle = "#ffffff";
  ctx.font = `700 46px ${FONT_DISPLAY}`;
  const titleReserve = spec.pill ? 280 : spec.avatar || spec.photoUrl ? 140 : 0;
  ctx.fillText(trunc(ctx, spec.title, W - PAD * 2 - titleReserve), PAD, 108);

  // Player portrait, top-right — their real Reclub photo when it loaded CORS-clean,
  // otherwise the 8-bit match-sim sprite. Drawn on a soft disc so it reads against
  // the dark-green band. Single-subject cards only (Padel Wrapped); multi-player
  // recaps leave both unset.
  if (spec.photoUrl || spec.avatar) {
    const cx = W - PAD - 46;
    const cy = 82;
    const R = 52;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.10)";
    ctx.fill();

    const photo = getCachedPhoto(spec.photoUrl);
    if (photo) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, R - 2, 0, Math.PI * 2);
      ctx.clip();
      drawCover(ctx, photo, cx - (R - 2), cy - (R - 2), (R - 2) * 2, (R - 2) * 2);
      ctx.restore();
      ctx.beginPath();
      ctx.arc(cx, cy, R - 1, 0, Math.PI * 2);
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(255,255,255,0.55)";
      ctx.stroke();
    } else if (spec.avatar) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(3.4, 3.4);
      drawAvatar(ctx, spec.avatar, 0, 0, 1, 0);
      ctx.restore();
    }
  }

  // Status pill, top-right.
  if (spec.pill) {
    ctx.font = `700 26px ${FONT_MONO}`;
    const pw = ctx.measureText(spec.pill.text).width + 44;
    const px = W - PAD - pw;
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    roundRect(ctx, px, 50, pw, 48, 24);
    ctx.fill();
    ctx.fillStyle = spec.pill.color;
    ctx.fillText(spec.pill.text, px + 22, 82);
  }

  let y = HEADER_H + 28;

  // Headline sentence.
  if (spec.headline) {
    ctx.fillStyle = BRAND.ink;
    ctx.font = `600 34px ${FONT_DISPLAY}`;
    ctx.fillText(trunc(ctx, spec.headline, W - PAD * 2), PAD, y + 34);
    y += HEADLINE_H;
  }

  // Hero stat.
  if (spec.hero) {
    ctx.textAlign = "center";
    ctx.fillStyle = BRAND.green;
    ctx.font = `700 96px ${FONT_DISPLAY}`;
    ctx.fillText(trunc(ctx, spec.hero.value, W - PAD * 2), W / 2, y + 92);
    ctx.fillStyle = BRAND.muted;
    ctx.font = `500 26px ${FONT_MONO}`;
    ctx.fillText(trunc(ctx, spec.hero.label.toUpperCase(), W - PAD * 2), W / 2, y + 132);
    ctx.textAlign = "left";
    y += HERO_H;
  }

  // Rows.
  for (const r of spec.rows ?? []) {
    const h = rowHeight(r);
    const baseline = y + (r.subtitle ? 34 : 40);

    // Left gutter: a game-icons glyph when the row has one, else its mono tag.
    const icon = r.icon ? getCachedIcon(r.icon, rowGlyphColor(r)) : null;
    if (icon) {
      const sz = 34;
      ctx.drawImage(icon, PAD, baseline - 27, sz, sz);
    } else if (r.tag) {
      ctx.fillStyle = rowGlyphColor(r);
      ctx.font = `700 20px ${FONT_MONO}`;
      ctx.fillText(r.tag, PAD, baseline);
    }

    const textX = r.tag || r.icon ? PAD + 72 : PAD;
    const valueText = r.value ?? "";
    ctx.font = `700 30px ${FONT_MONO}`;
    const valueW = valueText ? ctx.measureText(valueText).width + 24 : 0;

    ctx.fillStyle = BRAND.ink;
    ctx.font = `400 26px ${FONT_BODY}`;
    ctx.fillText(trunc(ctx, r.title, W - PAD - textX - valueW), textX, baseline);

    if (r.subtitle) {
      ctx.fillStyle = BRAND.muted;
      ctx.font = `400 20px ${FONT_BODY}`;
      ctx.fillText(trunc(ctx, r.subtitle, W - PAD - textX - valueW), textX, baseline + 30);
    }

    if (valueText) {
      ctx.font = `700 30px ${FONT_MONO}`;
      ctx.fillStyle = r.valueColor ?? (r.accent ? BRAND.green : BRAND.ink);
      ctx.textAlign = "right";
      ctx.fillText(valueText, W - PAD, baseline);
      ctx.textAlign = "left";
    }

    y += h;
  }

  // Gear strip — the player's racket as a product shot, named, with their side.
  if (hasGear(spec) && spec.gear) {
    ctx.strokeStyle = "#ececec";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD, y + 6);
    ctx.lineTo(W - PAD, y + 6);
    ctx.stroke();

    const tile = 72;
    const tileX = PAD;
    const tileY = y + 26;
    roundRect(ctx, tileX, tileY, tile, tile, 14);
    ctx.fillStyle = "#f6f5f2";
    ctx.fill();

    const racket = getCachedPhoto(spec.gear.racketUrl);
    if (racket) {
      drawContain(ctx, racket, tileX + 6, tileY + 6, tile - 12, tile - 12);
    } else {
      const icon = getCachedIcon("ping-pong-bat", BRAND.green);
      if (icon) ctx.drawImage(icon, tileX + 18, tileY + 18, tile - 36, tile - 36);
    }

    const tx = tileX + tile + 22;
    ctx.fillStyle = BRAND.muted;
    ctx.font = `600 18px ${FONT_MONO}`;
    ctx.fillText("GEAR", tx, tileY + 18);
    ctx.fillStyle = BRAND.ink;
    ctx.font = `700 30px ${FONT_DISPLAY}`;
    ctx.fillText(trunc(ctx, spec.gear.racketName ?? "Racket", W - PAD - tx), tx, tileY + 50);
    const sub = [spec.gear.racketBrand, spec.gear.position ? `Plays ${spec.gear.position}` : null]
      .filter(Boolean)
      .join(" · ");
    if (sub) {
      ctx.fillStyle = BRAND.muted;
      ctx.font = `400 20px ${FONT_BODY}`;
      ctx.fillText(trunc(ctx, sub, W - PAD - tx), tx, tileY + 78);
    }
    y += GEAR_H;
  }

  // Footer wordmark.
  ctx.fillStyle = BRAND.muted;
  ctx.font = `500 22px ${FONT_MONO}`;
  ctx.fillText(spec.footer ?? DEFAULT_FOOTER, PAD, canvas.height - 36);

  return canvas;
}

// object-fit: cover — fill the box, cropping overflow (used for the round portrait).
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

// object-fit: contain — fit the whole image inside the box (used for racket shots,
// which are transparent product PNGs that shouldn't be cropped).
function drawContain(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const scale = Math.min(w / img.naturalWidth, h / img.naturalHeight);
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function trunc(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (maxW <= 0) return "";
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + "…").width > maxW) t = t.slice(0, -1);
  return t + "…";
}
