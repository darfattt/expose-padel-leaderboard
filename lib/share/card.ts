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
  heading?: string; // a section label drawn above this row (groups rows into categories)
  icon?: string; // game-icons.net name; drawn in the left gutter in place of `tag`
  // A player's face for the left gutter (multi-player cards — Power Rankings,
  // Match Night recap). The 8-bit sprite is the always-available fallback; the
  // Reclub photo is drawn over it when it loads CORS-clean. Either one displaces
  // the tag/icon glyph.
  avatar?: AvatarSpec | null;
  photoUrl?: string | null;
  racketUrl?: string | null; // racket product shot, drawn as a small gear thumbnail by the value
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

// A static "post-match" 2D court scene, recreating the tournament sim's end frame
// (lib/sim + app/versus/MatchSim) as a still on the share card: the blue court,
// the four 8-bit players at their home spots, the scoreboard and the outcome
// banner. `players` is exactly four in fixed order — [A player, A pro, B player,
// B pro] — and the renderer owns their court positions, facing and label colours.
export interface CardCourtPlayer {
  avatar: AvatarSpec;
  name: string;
}
export interface CardCourt {
  teamAName: string; // green side (you), top-left scoreboard
  teamBName: string; // coral side (opponent), top-right scoreboard
  scoreA: number;
  scoreB: number;
  players: CardCourtPlayer[];
  bannerText: string; // the centred outcome line, e.g. "You & Pro win 21–18"
  win: boolean; // tints the banner + poses the figures (your side cheers / slumps)
}

export interface CardSpec {
  kicker: string; // small uppercase mono label in the header band
  title: string; // the big header line (player or event name)
  pill?: { text: string; color: string } | null; // status chip, top-right
  avatar?: AvatarSpec | null; // 8-bit pixel sprite drawn in the header (single-subject cards)
  photoUrl?: string | null; // a real player photo (Reclub) — drawn over the sprite when it loads
  // A second portrait drawn beside the player's (to its left) — the "pro twin"
  // on a Padel Wrapped card, so the two faces read side by side. Photo when it
  // loads CORS-clean, otherwise a colored initials disc.
  proPortrait?: { photoUrl?: string | null; initials: string; color: string } | null;
  gear?: CardGear | null; // racket strip above the footer
  headline?: string; // a sentence under the header
  court?: CardCourt | null; // a post-match 2D court still, drawn under the headline
  hero?: CardHero | null;
  rows?: CardRow[];
  footer?: string; // defaults to the site wordmark
  // Minimum canvas height. Cards grow with content; this pins a floor so a card
  // can be a fixed format — e.g. 1920 with the 1080 width gives a 9:16 Instagram
  // Stories portrait. On a card taller than its content, the slack is distributed
  // per `bodyAlign`.
  minHeight?: number;
  // How a card shorter than its `minHeight` floor sits in the slack between header
  // and footer: "center" (default) splits the slack above/below; "top" pins the
  // body just below the header and lets the slack fall to the footer.
  bodyAlign?: "top" | "center";
}

// Whether a gear strip has anything worth drawing.
function hasGear(spec: CardSpec): boolean {
  return !!spec.gear && !!(spec.gear.racketName || spec.gear.racketUrl);
}

// Whether a row carries a player face for its gutter.
function rowHasAvatar(r: CardRow): boolean {
  return !!(r.avatar || r.photoUrl);
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

// Every remote photo a spec will draw — the header portrait + pro twin + gear
// strip, plus each row's player face and racket thumbnail — fed to preloadPhotos()
// before renderCard so the synchronous draw pass can pull decoded images.
export function collectCardPhotos(spec: CardSpec): (string | null | undefined)[] {
  const urls: (string | null | undefined)[] = [
    spec.photoUrl,
    spec.proPortrait?.photoUrl,
    spec.gear?.racketUrl,
  ];
  for (const r of spec.rows ?? []) urls.push(r.photoUrl, r.racketUrl);
  return urls;
}

const W = 1080;
const PAD = 56;
const HEADER_H = 150;
const HEADLINE_H = 60;
const HERO_H = 150;
const ROW_H = 64;
const ROW_H_SUB = 88;
const SECTION_H = 58; // height a section heading adds above the row it sits on
const AVATAR_R = 24; // radius of a row's player-face disc (fits within ROW_H)
const GEAR_THUMB = 46; // side of a row's racket thumbnail tile
const GEAR_H = 132;
const FOOTER_H = 80;
const COURT_GAP = 28; // breathing room below the court still
const DEFAULT_FOOTER = "expose.padel-leaderboard";

// The post-match court still keeps the sim's 16:9 (480×270) aspect, scaled to the
// card's content width. Geometry below mirrors app/versus/MatchSim.
const SCENE_W = 480;
const SCENE_H = 270;
const SCENE_PAD_X = 30;
const SCENE_PAD_TOP = 50;
const SCENE_PAD_BOTTOM = 26;
const SCENE_NET_X = 0.5;
const SCENE_SERVICE_X = [0.3, 0.7];
const SCENE_SURROUND = "#5a7da6";
const SCENE_COURT = "#38506a";
const SCENE_LINE = "rgba(255,255,255,0.85)";
// Home spots for [A front, A back, B front, B back] and their label tints, copied
// from MatchSim so the still reads identically to the live tape.
const SCENE_HOME = [
  { x: 0.34, y: 0.36 },
  { x: 0.16, y: 0.68 },
  { x: 0.66, y: 0.36 },
  { x: 0.84, y: 0.68 },
];
const SCENE_FACING: (1 | -1)[] = [1, 1, -1, -1];
const SCENE_LABEL_COLORS = ["#dbeee9", "#bfe0d8", "#ffe0d6", "#ffcdbe"];

// Width the court still spans on the card, and its derived height (incl. the gap).
function courtBlockWidth(): number {
  return W - PAD * 2;
}
function courtHeight(spec: CardSpec): number {
  if (!spec.court) return 0;
  return Math.round((courtBlockWidth() * SCENE_H) / SCENE_W) + COURT_GAP;
}

function rowContentHeight(r: CardRow): number {
  return r.subtitle ? ROW_H_SUB : ROW_H;
}

function rowHeight(r: CardRow): number {
  return (r.heading ? SECTION_H : 0) + rowContentHeight(r);
}

// Height of the flowing body (everything between the header band and the footer).
function bodyHeight(spec: CardSpec): number {
  let h = 0;
  if (spec.headline) h += HEADLINE_H;
  if (spec.court) h += courtHeight(spec);
  if (spec.hero) h += HERO_H;
  h += (spec.rows ?? []).reduce((sum, r) => sum + rowHeight(r), 0);
  if (hasGear(spec)) h += GEAR_H;
  return h;
}

// Total canvas height is derived from the spec so cards grow with their content,
// then floored at spec.minHeight (for fixed formats like a Stories portrait).
function cardHeight(spec: CardSpec): number {
  const natural = Math.max(HEADER_H + 28 + bodyHeight(spec) + FOOTER_H, HEADER_H + 220);
  return Math.max(natural, spec.minHeight ?? 0);
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

  // Portraits, top-right. The player on the far right (their Reclub photo, else
  // the 8-bit sprite); on Padel Wrapped, their "pro twin" sits to the left so the
  // two faces read side by side. Reserve enough title width to clear them.
  const hasPlayer = !!(spec.photoUrl || spec.avatar);
  const portraitCount = (hasPlayer ? 1 : 0) + (spec.proPortrait ? 1 : 0);

  ctx.fillStyle = "#ffffff";
  ctx.font = `700 46px ${FONT_DISPLAY}`;
  const titleReserve = spec.pill ? 280 : portraitCount > 0 ? 24 + portraitCount * 118 : 0;
  ctx.fillText(trunc(ctx, spec.title, W - PAD * 2 - titleReserve), PAD, 108);

  // Single-subject cards only (Padel Wrapped); multi-player recaps leave both unset.
  if (portraitCount > 0) {
    const R = 52;
    const cy = 82;
    let cx = W - PAD - 46;
    if (hasPlayer) {
      drawPortraitDisc(ctx, cx, cy, R);
      const photo = getCachedPhoto(spec.photoUrl);
      if (photo) {
        drawDiscPhoto(ctx, photo, cx, cy, R);
      } else if (spec.avatar) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(3.4, 3.4);
        drawAvatar(ctx, spec.avatar, 0, 0, 1, 0);
        ctx.restore();
      }
      cx -= R * 2 + 14;
    }
    if (spec.proPortrait) {
      const pro = spec.proPortrait;
      const photo = getCachedPhoto(pro.photoUrl);
      if (photo) {
        drawPortraitDisc(ctx, cx, cy, R);
        drawDiscPhoto(ctx, photo, cx, cy, R);
      } else {
        // No headshot — a colored initials disc, matching the on-page pro avatars.
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, Math.PI * 2);
        ctx.fillStyle = pro.color;
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.font = `700 ${Math.round(R * 0.72)}px ${FONT_DISPLAY}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(pro.initials, cx, cy + 2);
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
      }
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

  // Body flows from below the header; on a fixed-format (taller) card the slack
  // between header and footer is split above/below to center the content, or kept
  // below it (bodyAlign "top") so the body pins just under the header.
  const bodyTop = HEADER_H + 28;
  const slack = Math.max(0, canvas.height - FOOTER_H - bodyTop - bodyHeight(spec));
  let y = bodyTop + (spec.bodyAlign === "top" ? 0 : slack / 2);

  // Headline sentence.
  if (spec.headline) {
    ctx.fillStyle = BRAND.ink;
    ctx.font = `600 34px ${FONT_DISPLAY}`;
    ctx.fillText(trunc(ctx, spec.headline, W - PAD * 2), PAD, y + 34);
    y += HEADLINE_H;
  }

  // Post-match court still.
  if (spec.court) {
    drawCourtScene(ctx, spec.court, PAD, y, courtBlockWidth());
    y += courtHeight(spec);
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

    // Section heading, drawn above the row's content to group rows into categories.
    if (r.heading) {
      ctx.fillStyle = BRAND.muted;
      ctx.font = `600 24px ${FONT_MONO}`;
      ctx.fillText(trunc(ctx, r.heading.toUpperCase(), W - PAD * 2), PAD, y + 36);
    }

    const top = y + (r.heading ? SECTION_H : 0);
    const baseline = top + (r.subtitle ? 34 : 40);
    const rowMid = top + rowContentHeight(r) / 2;

    // Left gutter: the player's face disc when the row carries one, else a
    // game-icons glyph, else its mono tag.
    if (rowHasAvatar(r)) {
      drawRowAvatar(ctx, r, PAD + AVATAR_R, rowMid, AVATAR_R);
    } else {
      const icon = r.icon ? getCachedIcon(r.icon, rowGlyphColor(r)) : null;
      if (icon) {
        const sz = 34;
        ctx.drawImage(icon, PAD, baseline - 27, sz, sz);
      } else if (r.tag) {
        ctx.fillStyle = rowGlyphColor(r);
        ctx.font = `700 20px ${FONT_MONO}`;
        ctx.fillText(r.tag, PAD, baseline);
      }
    }

    const textX = rowHasAvatar(r) || r.tag || r.icon ? PAD + 72 : PAD;
    const valueText = r.value ?? "";
    ctx.font = `700 30px ${FONT_MONO}`;
    const valueW = valueText ? ctx.measureText(valueText).width + 24 : 0;

    // Gear thumbnail: the player's racket as a small tile, just left of the value.
    const racket = getCachedPhoto(r.racketUrl);
    const gearW = racket ? GEAR_THUMB + 18 : 0;
    if (racket) {
      const gx = W - PAD - valueW - GEAR_THUMB;
      const gy = rowMid - GEAR_THUMB / 2;
      roundRect(ctx, gx, gy, GEAR_THUMB, GEAR_THUMB, 10);
      ctx.fillStyle = "#f6f5f2";
      ctx.fill();
      drawContain(ctx, racket, gx + 4, gy + 4, GEAR_THUMB - 8, GEAR_THUMB - 8);
    }

    const rightReserve = valueW + gearW;
    ctx.fillStyle = BRAND.ink;
    ctx.font = `400 26px ${FONT_BODY}`;
    ctx.fillText(trunc(ctx, r.title, W - PAD - textX - rightReserve), textX, baseline);

    if (r.subtitle) {
      ctx.fillStyle = BRAND.muted;
      ctx.font = `400 20px ${FONT_BODY}`;
      ctx.fillText(trunc(ctx, r.subtitle, W - PAD - textX - rightReserve), textX, baseline + 30);
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

// Draw the post-match court still: the blue court + markings + net, the four
// 8-bit players posed at their home spots (your side cheers on a win, slumps on a
// loss — mirroring MatchSim's end frame), the scoreboard and the outcome banner.
// `bw` is the on-card block width; the whole 480×270 scene scales to fit it.
function drawCourtScene(
  ctx: CanvasRenderingContext2D,
  court: CardCourt,
  bx: number,
  by: number,
  bw: number
) {
  const f = bw / SCENE_W;
  const sx = (x: number) => SCENE_PAD_X + x * (SCENE_W - 2 * SCENE_PAD_X);
  const sy = (y: number) => SCENE_PAD_TOP + y * (SCENE_H - SCENE_PAD_TOP - SCENE_PAD_BOTTOM);

  ctx.save();
  // Rounded clip so the still sits as a neat tile on the card body.
  roundRect(ctx, bx, by, bw, SCENE_H * f, 16);
  ctx.clip();
  ctx.translate(bx, by);
  ctx.scale(f, f);
  ctx.imageSmoothingEnabled = false;

  // Court surround + playing rectangle.
  ctx.fillStyle = SCENE_SURROUND;
  ctx.fillRect(0, 0, SCENE_W, SCENE_H);
  ctx.fillStyle = SCENE_COURT;
  ctx.fillRect(sx(0), sy(0), sx(1) - sx(0), sy(1) - sy(0));
  // Glass-wall hint + outer boundary.
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 1;
  ctx.strokeRect(sx(0) + 2.5, sy(0) + 2.5, sx(1) - sx(0) - 5, sy(1) - sy(0) - 5);
  ctx.strokeStyle = SCENE_LINE;
  ctx.fillStyle = SCENE_LINE;
  ctx.strokeRect(sx(0) + 0.5, sy(0) + 0.5, sx(1) - sx(0) - 1, sy(1) - sy(0) - 1);
  // Service lines + centre service line.
  for (const s of SCENE_SERVICE_X) ctx.fillRect(Math.round(sx(s)), sy(0), 1, sy(1) - sy(0));
  ctx.fillRect(sx(SCENE_SERVICE_X[0]), Math.round(sy(0.5)), sx(SCENE_SERVICE_X[1]) - sx(SCENE_SERVICE_X[0]), 1);
  // Net: centre line + posts.
  const nx = Math.round(sx(SCENE_NET_X));
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.fillRect(nx - 1, sy(0) - 4, 2, sy(1) - sy(0) + 8);
  ctx.fillStyle = "#1b1b1b";
  ctx.fillRect(nx - 2, sy(0) - 6, 4, 4);
  ctx.fillRect(nx - 2, sy(1) + 2, 4, 4);

  // Players, back-to-front so nearer figures overlap farther ones.
  const players = court.players.slice(0, 4);
  const order = [0, 1, 2, 3]
    .filter((i) => players[i])
    .sort((i, j) => SCENE_HOME[i].y - SCENE_HOME[j].y);
  ctx.textAlign = "center";
  ctx.font = `6px ${FONT_MONO}`;
  for (const i of order) {
    const px = sx(SCENE_HOME[i].x);
    const py = sy(SCENE_HOME[i].y);
    // Your side is A (0,1). Winners hop with arms up; losers topple toward their
    // own back wall and cry — the held celebration frame.
    const won = court.win ? i < 2 : i >= 2;
    const pose = won
      ? { lift: 4, cheer: 1 }
      : { tilt: (Math.PI / 2 - 0.14) * (i < 2 ? -1 : 1), tears: 1 };
    drawAvatar(ctx, players[i].avatar, px, py, SCENE_FACING[i], 0, pose);
    ctx.fillStyle = SCENE_LABEL_COLORS[i];
    ctx.fillText(trunc(ctx, players[i].name, 96), px, py + 22);
  }

  // Loss dims the whole frame, as in the live tape's defeat overlay.
  if (!court.win) {
    ctx.fillStyle = "rgba(8,12,18,0.32)";
    ctx.fillRect(0, 0, SCENE_W, SCENE_H);
  }

  // Scoreboard.
  ctx.textAlign = "left";
  ctx.font = `bold 12px ${FONT_MONO}`;
  ctx.fillStyle = "#7fe6cf";
  ctx.fillText(court.teamAName.slice(0, 10), SCENE_PAD_X, 16);
  ctx.textAlign = "center";
  ctx.font = `bold 16px ${FONT_MONO}`;
  ctx.fillStyle = "#ffffff";
  ctx.fillText(`${court.scoreA} – ${court.scoreB}`, SCENE_W / 2, 18);
  ctx.textAlign = "right";
  ctx.font = `bold 12px ${FONT_MONO}`;
  ctx.fillStyle = "#ff9d85";
  ctx.fillText(court.teamBName.slice(0, 10), SCENE_W - SCENE_PAD_X, 16);

  // Outcome banner.
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(0, SCENE_H / 2 - 22, SCENE_W, 44);
  ctx.textAlign = "center";
  ctx.font = `bold 16px ${FONT_MONO}`;
  ctx.fillStyle = court.win ? "#7fe6cf" : "#ff9d85";
  ctx.fillText(trunc(ctx, court.bannerText, SCENE_W - 24), SCENE_W / 2, SCENE_H / 2 + 5);

  ctx.restore();
  ctx.textAlign = "left";
}

// A player's face as a disc on the light card body — their Reclub photo when it
// loaded CORS-clean, otherwise the deterministic 8-bit sprite. Used in the gutter
// of multi-player rows (Power Rankings, Match Night recap).
function drawRowAvatar(ctx: CanvasRenderingContext2D, r: CardRow, cx: number, cy: number, R: number) {
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fillStyle = "#f6f5f2";
  ctx.fill();

  const photo = getCachedPhoto(r.photoUrl);
  if (photo) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R - 1, 0, Math.PI * 2);
    ctx.clip();
    drawCover(ctx, photo, cx - (R - 1), cy - (R - 1), (R - 1) * 2, (R - 1) * 2);
    ctx.restore();
  } else if (r.avatar) {
    // Sprite art is centred on (0,0) spanning ~y[-14,14]; scale it to fill the
    // disc, clipped so legs/shadow stay tidy on the white body.
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R - 1, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(cx, cy);
    const s = (R * 2) / 30;
    ctx.scale(s, s);
    drawAvatar(ctx, r.avatar, 0, 0, 1, 0);
    ctx.restore();
  }

  ctx.beginPath();
  ctx.arc(cx, cy, R - 0.5, 0, Math.PI * 2);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "#e6e4df";
  ctx.stroke();
}

// The soft translucent disc a header portrait sits on, so it reads against the
// dark-green band.
function drawPortraitDisc(ctx: CanvasRenderingContext2D, cx: number, cy: number, R: number) {
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.10)";
  ctx.fill();
}

// A circular, cover-cropped photo clipped to the disc, with a hairline ring.
function drawDiscPhoto(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  cx: number,
  cy: number,
  R: number
) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R - 2, 0, Math.PI * 2);
  ctx.clip();
  drawCover(ctx, img, cx - (R - 2), cy - (R - 2), (R - 2) * 2, (R - 2) * 2);
  ctx.restore();
  ctx.beginPath();
  ctx.arc(cx, cy, R - 1, 0, Math.PI * 2);
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.stroke();
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
