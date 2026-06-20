// A declarative, reusable share-card renderer. Features describe *what* to draw
// (a CardSpec) and this module draws it to an off-screen <canvas> in the
// Cohere-inspired house style (white body, dark-green header band, coral
// accents). Generalised from the tournament run card so Match Night recaps,
// Power Rankings and Padel Wrapped all share one branded look.
//
// DOM-dependent (it touches `document`/`canvas`), so import only from client
// components. Pure of any network/Supabase concerns.

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

export interface CardSpec {
  kicker: string; // small uppercase mono label in the header band
  title: string; // the big header line (player or event name)
  pill?: { text: string; color: string } | null; // status chip, top-right
  headline?: string; // a sentence under the header
  hero?: CardHero | null;
  rows?: CardRow[];
  footer?: string; // defaults to the site wordmark
}

const W = 1080;
const PAD = 56;
const HEADER_H = 150;
const HEADLINE_H = 60;
const HERO_H = 150;
const ROW_H = 64;
const ROW_H_SUB = 88;
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
  ctx.fillText(trunc(ctx, spec.title, W - PAD * 2 - (spec.pill ? 280 : 0)), PAD, 108);

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

    if (r.tag) {
      ctx.fillStyle = r.tagColor ?? (r.accent ? BRAND.green : BRAND.muted);
      ctx.font = `700 20px ${FONT_MONO}`;
      ctx.fillText(r.tag, PAD, baseline);
    }

    const textX = r.tag ? PAD + 72 : PAD;
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

  // Footer wordmark.
  ctx.fillStyle = BRAND.muted;
  ctx.font = `500 22px ${FONT_MONO}`;
  ctx.fillText(spec.footer ?? DEFAULT_FOOTER, PAD, canvas.height - 36);

  return canvas;
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
