// Skill effect animations for the match canvas. Each named signature move from
// lib/sim/skills.ts maps to a distinct, hand-drawn pixel effect: a cannonball
// that flattens the opponent, a blazing fire serve, a winner that breaks the
// net, ice shards raining down and freezing them, a serpentine víbora bolt, a
// towering Great Wall the ball bounces off, a tornado that spins the opponent
// "berputar putar", an all-court dash, a target-lock finisher and a clever-play
// spark. Purely cosmetic — drawn over the scene while the skill label is
// flashing (see MatchSim.FLASH_MS).
//
// drawSkillFx() renders the projectiles / particles; fxDynamics() returns the
// knockdown + screen-shake the renderer applies to the victim's sprite and the
// whole play area, so the visuals and the physical reaction stay in lock-step.
// The tornado's victim-spin is driven separately in MatchSim (an AvatarPose.spin)
// since it whirls the sprite rather than toppling it.

export type FxKind =
  | "cannon"
  | "fireserve"
  | "netbreak"
  | "ice"
  | "vibora"
  | "wall"
  | "greatwall"
  | "lob"
  | "tornado"
  | "allcourt"
  | "closer"
  | "volley"
  | "backhand"
  | "forehand"
  | "return"
  | "smart"
  // Multi-ball barrages — a flurry of balls overwhelms the opponent.
  | "barrage"
  | "meteor";

// Every value FxKind can take — used to validate the `fx` token a Skill carries
// (lib/sim/skills.ts) before trusting it as a kind.
const FX_KINDS: readonly FxKind[] = [
  "cannon",
  "fireserve",
  "netbreak",
  "ice",
  "vibora",
  "wall",
  "greatwall",
  "lob",
  "tornado",
  "allcourt",
  "closer",
  "volley",
  "backhand",
  "forehand",
  "return",
  "smart",
  "barrage",
  "meteor",
];

// The centre net's x in canvas pixels (cx(0.5)) and the playing area's vertical
// span (cy(0)..cy(1)); duplicated here so the net-break and Great Wall can sit on
// the real court without threading court constants through every draw call. Keep
// in sync with MatchSim's PAD_*/NET_X if those move (drawWall already assumes 240).
const NET_PX = 240;
const COURT_TOP = 50;
const COURT_BOTTOM = 244;

// Attacker (effect origin) and victim (impact point), in canvas pixels.
export interface FxGeom {
  ax: number;
  ay: number;
  vx: number;
  vy: number;
}

// Resolve a skill's effect. Prefers the explicit `fx` token a Skill carries (so a
// personalised name like "Vertex Smash" still finds its animation), then matches
// known display names, then a keyword in the name (the personalised suffixes —
// Smash / Block / Return / Volley …), and finally falls back to the understated
// "smart play" spark for anything unrecognised.
export function fxKindForSkill(name: string, token?: string | null): FxKind {
  if (token && (FX_KINDS as readonly string[]).includes(token)) return token as FxKind;
  switch (name) {
    case "Cannon Smash":
      return "cannon";
    case "Fire Serve":
      return "fireserve";
    case "Net Breaker":
      return "netbreak";
    case "Ice Bandeja":
      return "ice";
    case "Víbora":
      return "vibora";
    case "Wall Defense": // legacy name — now renders the Great Wall
    case "Great Wall":
      return "greatwall";
    case "Metronome Lob": // legacy name — now whips up a tornado
    case "Tornado Lob":
      return "tornado";
    case "All-Court":
      return "allcourt";
    case "Closer Instinct":
      return "closer";
    case "Ball Barrage":
      return "barrage";
    case "Meteor Shower":
      return "meteor";
  }
  // Keyword fallback for personalised / kudos names ("Vertex Smash", "Net Storm").
  const n = name.toLowerCase();
  if (n.includes("barrage")) return "barrage";
  if (n.includes("meteor")) return "meteor";
  if (n.includes("smash")) return "cannon";
  if (n.includes("block") || n.includes("wall") || n.includes("defen")) return "greatwall";
  if (n.includes("volley") || n.includes("storm")) return "volley";
  if (n.includes("backhand") || n.includes("whip")) return "backhand";
  if (n.includes("forehand") || n.includes("drive")) return "forehand";
  if (n.includes("return") || n.includes("counter")) return "return";
  if (n.includes("lob") || n.includes("tornado")) return "tornado";
  if (n.includes("serve") || n.includes("fire")) return "fireserve";
  if (n.includes("víbora") || n.includes("vibora")) return "vibora";
  if (n.includes("bandeja") || n.includes("ice")) return "ice";
  if (n.includes("dash") || n.includes("blur")) return "allcourt";
  return "smart";
}

// How hard a skill hits: knockdown drives the victim's topple (0 = upright,
// 1 = flat out); shake is the screen jolt in pixels. Defensive / finesse moves
// return zero — only the strikes put someone on the floor.
export function fxDynamics(kind: FxKind, p: number): { knockdown: number; shake: number } {
  const afterHit = (hit: string | number, ramp: number) =>
    p < (hit as number) ? 0 : Math.min(1, (p - (hit as number)) / ramp);
  const fade = (hit: number, span: number, amp: number) =>
    p < hit ? 0 : amp * Math.max(0, 1 - (p - hit) / span);

  switch (kind) {
    case "cannon":
      return { knockdown: afterHit(0.42, 0.12), shake: fade(0.42, 0.4, 3.4) };
    case "fireserve":
      return { knockdown: afterHit(0.45, 0.12), shake: fade(0.45, 0.4, 3.2) };
    case "closer":
      return { knockdown: 0.85 * afterHit(0.5, 0.12), shake: fade(0.5, 0.35, 2.2) };
    case "ice":
      return { knockdown: afterHit(0.45, 0.22), shake: fade(0.45, 0.3, 1.3) };
    case "vibora":
      return { knockdown: 0.5 * afterHit(0.4, 0.15), shake: fade(0.4, 0.3, 1.6) };
    case "netbreak":
      // No one topples — the net does; the court just jolts as it tears.
      return { knockdown: 0, shake: fade(0.3, 0.45, 3.6) };
    case "tornado":
      // The victim spins (handled via AvatarPose.spin), so no knockdown here —
      // just a swelling rumble while the funnel is on them.
      return { knockdown: 0, shake: Math.max(0, 1.4 * Math.sin(Math.PI * p)) };
    case "allcourt":
      return { knockdown: 0.35 * afterHit(0.5, 0.22), shake: 0 };
    case "forehand":
      // A flat power drive — the heaviest non-overhead hit, snaps them back hard.
      return { knockdown: 0.9 * afterHit(0.4, 0.12), shake: fade(0.4, 0.4, 3) };
    case "return":
      // The counter lands late but lands clean.
      return { knockdown: 0.7 * afterHit(0.55, 0.14), shake: fade(0.55, 0.35, 2.2) };
    case "backhand":
      // A whipped cross stings rather than flattens.
      return { knockdown: 0.5 * afterHit(0.42, 0.16), shake: fade(0.42, 0.3, 1.6) };
    case "volley":
      // Quick hands at the net — a sharp jolt, not a topple.
      return { knockdown: 0.4 * afterHit(0.5, 0.18), shake: fade(0.5, 0.25, 1.4) };
    case "barrage":
      // A wall of balls — flattens the victim and rattles the whole court as it
      // builds, each ball adding to the rumble.
      return { knockdown: afterHit(0.5, 0.1), shake: fade(0.18, 0.7, 3.6) };
    case "meteor":
      // Overheads raining down — the heaviest hit, with a long climbing rumble.
      return { knockdown: afterHit(0.5, 0.12), shake: fade(0.2, 0.65, 3.8) };
    default:
      return { knockdown: 0, shake: 0 }; // wall, greatwall, lob, smart — feet stay planted
  }
}

// The fraction of the flash timeline (0..1 of FLASH_MS) at which each effect
// visually *lands* — the cannonball detonates, the shards shatter, the funnel
// touches down. The renderer uses the matching `hit` constants in each draw fn;
// MatchSim reads this so the impact sound fires on the hit, not when the label
// first pops up. Keep in step with the `hit`/`rise` thresholds in the draws.
export function fxImpactFraction(kind: FxKind): number {
  switch (kind) {
    case "cannon":
      return 0.42;
    case "fireserve":
      return 0.45;
    case "ice":
      return 0.45;
    case "vibora":
      return 0.4;
    case "netbreak":
      return 0.3;
    case "wall":
    case "greatwall":
      return 0.34;
    case "tornado":
      return 0.28;
    case "closer":
    case "allcourt":
      return 0.5;
    case "lob":
      return 0.5;
    case "forehand":
      return 0.4;
    case "backhand":
      return 0.42;
    case "volley":
      return 0.5;
    case "return":
      return 0.55;
    case "barrage":
    case "meteor":
      return 0.5; // the final, heaviest ball lands — see drawBarrage/drawMeteor
    default:
      return 0.12; // smart play — the spark is early and lingering
  }
}

// The heaviest strikes don't just topple the victim — they blast them clean off
// the court and into the back glass (the renderer flings the sprite out of the
// pitch and cracks the wall where they land). Defensive / finesse moves don't.
export function fxLaunchesVictim(kind: FxKind): boolean {
  return kind === "cannon" || kind === "forehand" || kind === "barrage" || kind === "meteor";
}

// How far through the "flung off the pitch" arc the victim is, 0..1: zero until
// the strike lands (fxImpactFraction), then ramps to 1 as they sail into the
// wall. The renderer maps this to the outward launch + the crashing arc, and to
// how far the glass crack has spread. Returns 0 for non-launching kinds.
export function fxLaunch(kind: FxKind, p: number): number {
  if (!fxLaunchesVictim(kind)) return 0;
  const hit = fxImpactFraction(kind);
  if (p <= hit) return 0;
  return Math.min(1, (p - hit) / (1 - hit));
}

// --- low-level helpers ------------------------------------------------------

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}
function star(ctx: CanvasRenderingContext2D, x: number, y: number, ro: number, ri: number) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const rr = i % 2 ? ri : ro;
    const sx = x + Math.cos(a) * rr;
    const sy = y + Math.sin(a) * rr;
    if (i) ctx.lineTo(sx, sy);
    else ctx.moveTo(sx, sy);
  }
  ctx.closePath();
  ctx.fill();
}
// Stable pseudo-random in [0,1) from a seed + index (so particles don't flicker
// frame to frame — they're a fixed function of the effect's seed).
function rand(seed: number, i: number): number {
  const x = Math.sin(seed * 0.013 + i * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

// --- celebration ------------------------------------------------------------

const CONFETTI = ["#ff5c5c", "#ffd24a", "#7fe6cf", "#6db3ff", "#ff9d85", "#caa6ff", "#9fe870"];

// Confetti rain for the post-match celebration. Pieces fall and loop across the
// court band [x0,x1] × [yTop,yBottom]; their spread, speed and sway are a fixed
// function of the piece index, so they don't flicker, and `t` (a free-running
// celebration clock in ms) drives the descent. Drawn over the whole scene.
export function drawConfetti(
  ctx: CanvasRenderingContext2D,
  t: number,
  x0: number,
  x1: number,
  yTop: number,
  yBottom: number,
  count = 40
) {
  const span = x1 - x0;
  const fall = yBottom - yTop + 40;
  for (let i = 0; i < count; i++) {
    const base = x0 + rand(i, 1) * span;
    const speed = 0.04 + rand(i, 2) * 0.06;
    const y = yTop - 20 + ((t * speed + rand(i, 3) * fall) % fall);
    const sway = Math.sin(t * 0.005 + i) * 5;
    const flutter = Math.cos(t * 0.012 + i) > 0 ? 2 : 1; // flip width to "tumble"
    ctx.fillStyle = CONFETTI[i % CONFETTI.length];
    ctx.fillRect(Math.round(base + sway), Math.round(y), flutter, 3);
  }
  ctx.globalAlpha = 1;
}

// The flip side of the confetti: a sombre, grey rain for when *your* side loses.
// Slanted streaks fall fast across the court band [x0,x1] × [yTop,yBottom] — same
// deterministic, looping descent as the confetti so it doesn't flicker — and a few
// of them puddle-splash near the floor. Pair with a dim overlay drawn by the
// caller. `t` is the free-running celebration clock in ms.
const RAIN = ["rgba(150,170,190,0.55)", "rgba(120,140,165,0.5)", "rgba(180,195,210,0.45)"];

export function drawDefeat(
  ctx: CanvasRenderingContext2D,
  t: number,
  x0: number,
  x1: number,
  yTop: number,
  yBottom: number,
  count = 70
) {
  const span = x1 - x0;
  const fall = yBottom - yTop + 40;
  ctx.lineWidth = 1;
  for (let i = 0; i < count; i++) {
    const base = x0 + rand(i, 1) * span;
    const speed = 0.16 + rand(i, 2) * 0.16; // rain falls faster than confetti
    const y = yTop - 20 + ((t * speed + rand(i, 3) * fall) % fall);
    const len = 4 + rand(i, 4) * 5;
    ctx.strokeStyle = RAIN[i % RAIN.length];
    ctx.beginPath();
    ctx.moveTo(Math.round(base), Math.round(y));
    ctx.lineTo(Math.round(base) - 2, Math.round(y + len)); // slight diagonal slant
    ctx.stroke();
    // a low splash tick where a streak meets the floor
    if (y + len >= yBottom - 2 && y + len <= yBottom + 4) {
      ctx.fillStyle = RAIN[(i + 1) % RAIN.length];
      ctx.fillRect(Math.round(base) - 2, Math.round(yBottom) - 1, 4, 1);
    }
  }
  ctx.globalAlpha = 1;
}

// --- per-skill effects ------------------------------------------------------

export function drawSkillFx(
  ctx: CanvasRenderingContext2D,
  kind: FxKind,
  p: number,
  g: FxGeom,
  color: string,
  seed: number
) {
  switch (kind) {
    case "cannon":
      return drawCannon(ctx, p, g, seed);
    case "fireserve":
      return drawFireServe(ctx, p, g, seed);
    case "netbreak":
      return drawNetBreak(ctx, p, g, seed);
    case "ice":
      return drawIce(ctx, p, g, seed);
    case "vibora":
      return drawVibora(ctx, p, g, seed);
    case "wall":
      return drawWall(ctx, p, g);
    case "greatwall":
      return drawGreatWall(ctx, p, g);
    case "lob":
      return drawLob(ctx, p, g, color);
    case "tornado":
      return drawTornado(ctx, p, g, seed);
    case "allcourt":
      return drawAllcourt(ctx, p, g, color, seed);
    case "closer":
      return drawCloser(ctx, p, g);
    case "volley":
      return drawVolley(ctx, p, g, color, seed);
    case "backhand":
      return drawBackhand(ctx, p, g, color, seed);
    case "forehand":
      return drawForehand(ctx, p, g, color, seed);
    case "return":
      return drawReturn(ctx, p, g, color, seed);
    case "smart":
      return drawSmart(ctx, p, g, color);
    case "barrage":
      return drawBarrage(ctx, p, g, color, seed);
    case "meteor":
      return drawMeteor(ctx, p, g, seed);
  }
}

// Glass-wall crack — a spider-web fracture blooms where a launched victim crashes
// into the back glass: a bright impact star, jagged radial spokes, a couple of
// web rings, and a few slivers shaking loose and dropping. `p` (0..1) grows the
// fracture; drawn by MatchSim at the wall point after a heavy strike lands. Pure
// overlay (no save/restore — resets globalAlpha to 1 like the per-skill draws).
export function drawGlassCrack(
  ctx: CanvasRenderingContext2D,
  p: number,
  x: number,
  y: number,
  seed: number
) {
  const reach = 6 + p * 26;
  // Bright flash at the point of impact, fading as the cracks take over.
  ctx.globalAlpha = Math.max(0, 1 - p * 1.4);
  ctx.fillStyle = "#ffffff";
  circle(ctx, x, y, 2 + 4 * (1 - p));
  // Jagged radial spokes racing outward.
  ctx.globalAlpha = Math.min(1, 0.55 + p * 0.45);
  ctx.strokeStyle = "rgba(225,242,255,0.92)";
  ctx.lineWidth = 1;
  const spokes = 8;
  for (let i = 0; i < spokes; i++) {
    const a = i * ((Math.PI * 2) / spokes) + (rand(seed, i) - 0.5) * 0.5;
    const len = reach * (0.6 + 0.4 * rand(seed, i + 9));
    ctx.beginPath();
    ctx.moveTo(x, y);
    const segs = 3;
    for (let s = 1; s <= segs; s++) {
      const u = s / segs;
      const jit = (rand(seed, i * 7 + s) - 0.5) * 5;
      const sx = x + Math.cos(a) * len * u + Math.cos(a + Math.PI / 2) * jit;
      const sy = y + Math.sin(a) * len * u + Math.sin(a + Math.PI / 2) * jit;
      ctx.lineTo(sx, sy);
    }
    ctx.stroke();
  }
  // A couple of web rings linking the spokes.
  for (let r = 1; r <= 2; r++) {
    const rr = (reach * r) / 3;
    ctx.globalAlpha = Math.min(1, p) * Math.max(0, 0.5 - r * 0.12);
    ctx.beginPath();
    for (let i = 0; i <= spokes; i++) {
      const a = i * ((Math.PI * 2) / spokes);
      const rx = x + Math.cos(a) * rr;
      const ry = y + Math.sin(a) * rr;
      if (i) ctx.lineTo(rx, ry);
      else ctx.moveTo(rx, ry);
    }
    ctx.stroke();
  }
  // A few glass slivers shaking loose and dropping once the fracture is open.
  if (p > 0.4) {
    const e = (p - 0.4) / 0.6;
    ctx.fillStyle = "rgba(205,237,255,0.75)";
    for (let i = 0; i < 5; i++) {
      const sx = x + (rand(seed, i) - 0.5) * reach;
      const sy = y + e * e * 30 * (0.5 + rand(seed, i + 2));
      ctx.globalAlpha = Math.max(0, 1 - e);
      ctx.fillRect(Math.round(sx), Math.round(sy), 1, 2);
    }
  }
  ctx.globalAlpha = 1;
}

// Cannon Smash — a cannonball arcs over, then detonates on the opponent.
function drawCannon(ctx: CanvasRenderingContext2D, p: number, g: FxGeom, seed: number) {
  const hit = 0.42;
  if (p < hit) {
    const t = p / hit;
    // smoke trail behind the ball
    for (let i = 1; i <= 4; i++) {
      const tt = Math.max(0, t - i * 0.07);
      const sx = lerp(g.ax, g.vx, tt);
      const sy = lerp(g.ay, g.vy, tt) - 26 * Math.sin(Math.PI * tt);
      ctx.globalAlpha = 0.25 * (1 - i / 5);
      ctx.fillStyle = "#9aa3ad";
      ctx.fillRect(Math.round(sx) - 1, Math.round(sy) - 1, 3, 3);
    }
    ctx.globalAlpha = 1;
    // muzzle flash at the cannon
    if (t < 0.18) {
      ctx.globalAlpha = 1 - t / 0.18;
      ctx.fillStyle = "#ffd24a";
      star(ctx, g.ax, g.ay, 8, 3);
      ctx.globalAlpha = 1;
    }
    // the ball
    const bx = lerp(g.ax, g.vx, t);
    const by = lerp(g.ay, g.vy, t) - 26 * Math.sin(Math.PI * t);
    ctx.fillStyle = "#15181c";
    circle(ctx, bx, by, 3.2);
    ctx.fillStyle = "#3a4048";
    circle(ctx, bx - 1, by - 1, 1.1);
  } else {
    const e = (p - hit) / (1 - hit);
    const R = 6 + e * 20;
    ctx.globalAlpha = Math.max(0, 1 - e);
    ctx.strokeStyle = "#ffb23a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(g.vx, g.vy, R, 0, Math.PI * 2);
    ctx.stroke();
    for (let i = 0; i < 9; i++) {
      const a = i * ((Math.PI * 2) / 9) + seed;
      const d = R * (0.55 + 0.45 * rand(seed, i));
      const dx = g.vx + Math.cos(a) * d;
      const dy = g.vy + Math.sin(a) * d;
      ctx.fillStyle = i % 2 ? "#ffd24a" : "#ff7a1a";
      ctx.fillRect(Math.round(dx) - 1, Math.round(dy) - 1, 2, 2);
    }
    if (e < 0.4) {
      ctx.globalAlpha = 1 - e / 0.4;
      ctx.fillStyle = "#fff2c2";
      circle(ctx, g.vx, g.vy, 3 + 6 * (1 - e / 0.4));
    }
    ctx.globalAlpha = 1;
  }
}

// Ice Bandeja — shards rain from above, then shatter and freeze the opponent.
function drawIce(ctx: CanvasRenderingContext2D, p: number, g: FxGeom, seed: number) {
  const hit = 0.45;
  const n = 7;
  if (p < hit) {
    const t = p / hit;
    for (let i = 0; i < n; i++) {
      const delay = i * 0.05;
      const tt = clamp((t - delay) / (1 - delay), 0, 1);
      if (tt <= 0) continue;
      const sx = g.vx + (i - (n - 1) / 2) * 5 + (rand(seed, i) - 0.5) * 6;
      const sy = lerp(-10, g.vy, tt);
      drawShard(ctx, sx, sy, 0.7 + 0.3 * rand(seed, i + 9));
    }
  } else {
    const e = (p - hit) / (1 - hit);
    ctx.globalAlpha = Math.max(0, 1 - e);
    ctx.strokeStyle = "#bfe9ff";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(g.vx, g.vy, 4 + e * 16, 0, Math.PI * 2);
    ctx.stroke();
    for (let i = 0; i < 8; i++) {
      const a = i * ((Math.PI * 2) / 8);
      const d = e * 16;
      drawShard(ctx, g.vx + Math.cos(a) * d, g.vy + Math.sin(a) * d, 0.6);
    }
    for (let i = 0; i < 6; i++) {
      ctx.globalAlpha = (1 - e) * 0.8;
      ctx.fillStyle = "#eaf7ff";
      ctx.fillRect(
        Math.round(g.vx + (rand(seed, i) - 0.5) * 22),
        Math.round(g.vy - 6 + e * 14 + rand(seed, i + 3) * 6),
        1,
        1
      );
    }
    ctx.globalAlpha = 1;
  }
}
function drawShard(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.fillStyle = "#9fd8ff";
  ctx.beginPath();
  ctx.moveTo(x, y - 4 * s);
  ctx.lineTo(x + 2 * s, y);
  ctx.lineTo(x, y + 4 * s);
  ctx.lineTo(x - 2 * s, y);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#e6f6ff";
  ctx.fillRect(Math.round(x), Math.round(y) - 1, 1, 2);
}

// Víbora — a green serpentine bolt whips across and snaps at the opponent.
function drawVibora(ctx: CanvasRenderingContext2D, p: number, g: FxGeom, seed: number) {
  const hit = 0.4;
  const t = clamp(p / hit, 0, 1);
  const perp = Math.atan2(g.vy - g.ay, g.vx - g.ax) + Math.PI / 2;
  ctx.strokeStyle = "#39d353";
  ctx.lineWidth = 2;
  ctx.beginPath();
  const steps = 14;
  for (let i = 0; i <= steps; i++) {
    const u = (i / steps) * t;
    const bx = lerp(g.ax, g.vx, u);
    const by = lerp(g.ay, g.vy, u);
    const amp = 6 * Math.sin(u * Math.PI * 3 + seed);
    const x = bx + Math.cos(perp) * amp;
    const y = by + Math.sin(perp) * amp;
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  ctx.stroke();
  const hx = lerp(g.ax, g.vx, t);
  const hy = lerp(g.ay, g.vy, t);
  ctx.fillStyle = "#2bb443";
  circle(ctx, hx, hy, 2.4);
  ctx.fillStyle = "#d33";
  ctx.fillRect(Math.round(hx) - 1, Math.round(hy), 2, 1);
  if (p >= hit) {
    const e = (p - hit) / (1 - hit);
    ctx.globalAlpha = Math.max(0, 1 - e);
    for (let i = 0; i < 6; i++) {
      const a = i + seed;
      ctx.fillStyle = "#7CFC00";
      ctx.fillRect(
        Math.round(g.vx + Math.cos(a) * e * 12) - 1,
        Math.round(g.vy + Math.sin(a) * e * 12) - 1,
        2,
        2
      );
    }
    ctx.globalAlpha = 1;
  }
}

// Wall Defense — a glass wall rises in front of the defender; the ball ricochets.
function drawWall(ctx: CanvasRenderingContext2D, p: number, g: FxGeom) {
  const rise = Math.min(1, p / 0.3);
  const toNet = g.ax < 240 ? 11 : -11; // shade toward the centre net
  const wx = g.ax + toNet;
  const h = 30 * rise;
  const top = g.ay - 15;
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = "#bfe9ff";
  ctx.fillRect(Math.round(wx) - 2, Math.round(top), 4, h);
  ctx.globalAlpha = 0.6;
  ctx.strokeStyle = "#eaf7ff";
  ctx.lineWidth = 1;
  ctx.strokeRect(Math.round(wx) - 2, Math.round(top), 4, h);
  if (p > 0.3 && p < 0.62) {
    const e = (p - 0.3) / 0.32;
    ctx.globalAlpha = 1 - e;
    ctx.fillStyle = "#ffffff";
    for (let i = 0; i < 5; i++) {
      ctx.fillRect(Math.round(wx + e * 14) - 1, Math.round(top + 4 + i * 5), 1, 1);
    }
  }
  ctx.globalAlpha = 1;
}

// Metronome Lob — a high looping arc with a ticking pendulum.
function drawLob(ctx: CanvasRenderingContext2D, p: number, g: FxGeom, color: string) {
  const t = clamp(p / 0.7, 0, 1);
  const dots = 10;
  ctx.fillStyle = color;
  for (let i = 0; i <= dots; i++) {
    const u = i / dots;
    if (u > t) break;
    const x = lerp(g.ax, g.vx, u);
    const y = lerp(g.ay, g.vy, u) - 42 * Math.sin(Math.PI * u);
    ctx.globalAlpha = 0.8;
    ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 2);
  }
  const x = lerp(g.ax, g.vx, t);
  const y = lerp(g.ay, g.vy, t) - 42 * Math.sin(Math.PI * t);
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#e8f94a";
  circle(ctx, x, y, 2.4);
  // pendulum tick above the landing spot
  const sway = Math.sin(p * Math.PI * 4) * 7;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(g.vx, 14);
  ctx.lineTo(g.vx + sway, 4);
  ctx.stroke();
  ctx.fillStyle = color;
  circle(ctx, g.vx + sway, 4, 1.6);
}

// All-Court — a rapid dash with fading after-images and a sparkle on arrival.
function drawAllcourt(
  ctx: CanvasRenderingContext2D,
  p: number,
  g: FxGeom,
  color: string,
  seed: number
) {
  for (let i = 0; i < 5; i++) {
    const u = clamp(p - i * 0.08, 0, 1);
    const x = lerp(g.ax, (g.ax + g.vx) / 2, u);
    const y = lerp(g.ay, g.vy, u);
    ctx.globalAlpha = 0.5 * (1 - i / 5);
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x) - 3, Math.round(y) - 5, 6, 11);
  }
  ctx.globalAlpha = 1;
  if (p > 0.5) {
    const e = (p - 0.5) / 0.5;
    for (let i = 0; i < 6; i++) {
      const a = i * 1.05 + seed;
      ctx.globalAlpha = 1 - e;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(
        Math.round(g.vx + Math.cos(a) * e * 12) - 1,
        Math.round(g.vy + Math.sin(a) * e * 12) - 1,
        2,
        2
      );
    }
    ctx.globalAlpha = 1;
  }
}

// Closer Instinct — a target reticle locks on, then a finishing strike.
function drawCloser(ctx: CanvasRenderingContext2D, p: number, g: FxGeom) {
  const hit = 0.5;
  if (p < hit) {
    const t = p / hit;
    const R = 18 - t * 10;
    ctx.strokeStyle = "#ff5252";
    ctx.lineWidth = 1.5;
    bracket(ctx, g.vx - R, g.vy - R, 1, 1);
    bracket(ctx, g.vx + R, g.vy - R, -1, 1);
    bracket(ctx, g.vx - R, g.vy + R, 1, -1);
    bracket(ctx, g.vx + R, g.vy + R, -1, -1);
    ctx.beginPath();
    ctx.arc(g.vx, g.vy, R * 0.5, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    const e = (p - hit) / (1 - hit);
    ctx.globalAlpha = Math.max(0, 1 - e * 1.2);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(g.vx - 14, g.vy - 14);
    ctx.lineTo(g.vx + 14, g.vy + 14);
    ctx.moveTo(g.vx + 14, g.vy - 14);
    ctx.lineTo(g.vx - 14, g.vy + 14);
    ctx.stroke();
    ctx.fillStyle = "#ff5252";
    for (let i = 0; i < 6; i++) {
      const a = i * 1.05;
      ctx.fillRect(
        Math.round(g.vx + Math.cos(a) * e * 14) - 1,
        Math.round(g.vy + Math.sin(a) * e * 14) - 1,
        2,
        2
      );
    }
    ctx.globalAlpha = 1;
  }
}
function bracket(ctx: CanvasRenderingContext2D, x: number, y: number, sx: number, sy: number) {
  ctx.beginPath();
  ctx.moveTo(x, y + sy * 5);
  ctx.lineTo(x, y);
  ctx.lineTo(x + sx * 5, y);
  ctx.stroke();
}

// Smart Play — a lightbulb sparks over the player; a clever idea drifts across.
function drawSmart(ctx: CanvasRenderingContext2D, p: number, g: FxGeom, color: string) {
  const x = g.ax;
  const y = g.ay - 16;
  const glow = 0.5 + 0.5 * Math.sin(p * Math.PI * 6);
  ctx.globalAlpha = 0.5 + 0.5 * glow;
  ctx.fillStyle = "#ffe98a";
  circle(ctx, x, y, 3);
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#caa83a";
  ctx.fillRect(Math.round(x) - 1, Math.round(y) + 3, 2, 2);
  ctx.strokeStyle = "#ffe98a";
  ctx.lineWidth = 1;
  for (let i = 0; i < 6; i++) {
    const a = i * ((Math.PI * 2) / 6);
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * 5, y + Math.sin(a) * 5);
    ctx.lineTo(x + Math.cos(a) * (7 + glow * 2), y + Math.sin(a) * (7 + glow * 2));
    ctx.stroke();
  }
  if (p > 0.4) {
    const e = (p - 0.4) / 0.6;
    for (let i = 0; i < 4; i++) {
      const u = clamp(e - i * 0.1, 0, 1);
      const sx = lerp(x, g.vx, u);
      const sy = lerp(y, g.vy, u);
      ctx.globalAlpha = 1 - u;
      ctx.fillStyle = color;
      ctx.fillRect(Math.round(sx) - 1, Math.round(sy) - 1, 2, 2);
    }
    ctx.globalAlpha = 1;
  }
}

// Fire Serve — a blazing serve arcs over trailing flame, then erupts into a
// fireball that licks up over the opponent.
function drawFireServe(ctx: CanvasRenderingContext2D, p: number, g: FxGeom, seed: number) {
  const hit = 0.45;
  const flame = (x: number, y: number, s: number, i: number) => {
    // A little three-tone tongue of fire (red base, orange middle, yellow tip).
    ctx.fillStyle = "#d62828";
    ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 3, Math.round(4 * s) + 2);
    ctx.fillStyle = "#ff7a1a";
    ctx.fillRect(Math.round(x) - 1, Math.round(y) - Math.round(2 * s) - 1, 2, Math.round(3 * s) + 1);
    ctx.fillStyle = i % 2 ? "#ffd24a" : "#fff2c2";
    ctx.fillRect(Math.round(x), Math.round(y) - Math.round(4 * s) - 1, 1, 2);
  };
  if (p < hit) {
    const t = p / hit;
    // flame trail behind the serve
    for (let i = 1; i <= 5; i++) {
      const tt = Math.max(0, t - i * 0.06);
      const sx = lerp(g.ax, g.vx, tt);
      const sy = lerp(g.ay, g.vy, tt) - 30 * Math.sin(Math.PI * tt);
      const flick = 0.6 + 0.5 * rand(seed, i + Math.floor(t * 20));
      ctx.globalAlpha = 0.5 * (1 - i / 6);
      flame(sx, sy + 2, flick, i);
    }
    ctx.globalAlpha = 1;
    // the burning ball
    const bx = lerp(g.ax, g.vx, t);
    const by = lerp(g.ay, g.vy, t) - 30 * Math.sin(Math.PI * t);
    ctx.fillStyle = "#ff7a1a";
    circle(ctx, bx, by, 3.2);
    ctx.fillStyle = "#ffe98a";
    circle(ctx, bx, by, 1.6);
  } else {
    const e = (p - hit) / (1 - hit);
    // expanding heat ring
    const R = 6 + e * 18;
    ctx.globalAlpha = Math.max(0, 1 - e);
    ctx.strokeStyle = "#ff9d2a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(g.vx, g.vy, R, 0, Math.PI * 2);
    ctx.stroke();
    // tongues of flame rising off the opponent, plus a few flying embers
    const n = 7;
    for (let i = 0; i < n; i++) {
      const fx = g.vx + (i - (n - 1) / 2) * 4;
      const flick = 0.7 + 0.6 * rand(seed, i + Math.floor(e * 14));
      ctx.globalAlpha = Math.max(0, 1 - e * 0.8);
      flame(fx, g.vy + 3 - e * 6, flick * (1.2 - e), i);
    }
    ctx.globalAlpha = Math.max(0, 1 - e);
    for (let i = 0; i < 8; i++) {
      const a = i * ((Math.PI * 2) / 8) + seed;
      const d = R * (0.5 + 0.5 * rand(seed, i));
      ctx.fillStyle = i % 2 ? "#ffd24a" : "#ff5c5c";
      ctx.fillRect(
        Math.round(g.vx + Math.cos(a) * d) - 1,
        Math.round(g.vy + Math.sin(a) * d - e * 10) - 1,
        2,
        2
      );
    }
    // dark smoke curling up as it dies down
    if (e > 0.4) {
      ctx.globalAlpha = (e - 0.4) * 0.5;
      ctx.fillStyle = "#5a5450";
      for (let i = 0; i < 4; i++) {
        ctx.fillRect(
          Math.round(g.vx + (rand(seed, i) - 0.5) * 12),
          Math.round(g.vy - 8 - e * 14 - i * 3),
          3,
          3
        );
      }
    }
    ctx.globalAlpha = 1;
  }
}

// Net Breaker — a heavy winner slams the centre net; it cracks, then the mesh
// blows apart around the impact, panels tumbling away with gravity.
function drawNetBreak(ctx: CanvasRenderingContext2D, p: number, g: FxGeom, seed: number) {
  const hit = 0.3;
  // Centre the break on the impact height, kept inside the net's run.
  const cyImpact = clamp(g.vy, COURT_TOP + 14, COURT_BOTTOM - 14);
  const half = 22;
  const top = cyImpact - half;
  const bot = cyImpact + half;
  if (p < hit) {
    const t = p / hit;
    // a crack races out from the centre as the ball arrives
    ctx.strokeStyle = "#fff2c2";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(NET_PX, cyImpact);
    for (let i = 1; i <= 6; i++) {
      ctx.lineTo(NET_PX + (rand(seed, i) - 0.5) * 8 * t, cyImpact - (t * half * i) / 6);
    }
    ctx.moveTo(NET_PX, cyImpact);
    for (let i = 1; i <= 6; i++) {
      ctx.lineTo(NET_PX + (rand(seed, i + 6) - 0.5) * 8 * t, cyImpact + (t * half * i) / 6);
    }
    ctx.stroke();
    // bright flash at the point of contact
    ctx.globalAlpha = 1 - t;
    ctx.fillStyle = "#ffffff";
    circle(ctx, NET_PX, cyImpact, 3 + 4 * (1 - t));
    ctx.globalAlpha = 1;
  } else {
    const e = (p - hit) / (1 - hit);
    // the standing remnants of the net above and below the torn gap
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    const gap = half * Math.min(1, e * 1.4);
    ctx.fillRect(NET_PX - 1, COURT_TOP - 4, 2, top - gap - (COURT_TOP - 4));
    ctx.fillRect(NET_PX - 1, bot + gap, 2, COURT_BOTTOM + 4 - (bot + gap));
    // panels of mesh flung off, falling and fading
    for (let i = 0; i < 10; i++) {
      const side = i % 2 ? 1 : -1;
      const sp = 0.5 + rand(seed, i);
      const px = NET_PX + side * e * (10 + 26 * sp);
      const py = cyImpact + (rand(seed, i + 3) - 0.5) * half * 1.6 + e * e * 40 * sp;
      ctx.globalAlpha = Math.max(0, 1 - e);
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      // a little cross of net so each shard still reads as mesh
      ctx.fillRect(Math.round(px) - 1, Math.round(py), 3, 1);
      ctx.fillRect(Math.round(px), Math.round(py) - 1, 1, 3);
    }
    // sparks at the tear
    ctx.globalAlpha = Math.max(0, 1 - e * 1.3);
    for (let i = 0; i < 6; i++) {
      const a = i * ((Math.PI * 2) / 6) + seed;
      ctx.fillStyle = i % 2 ? "#ffd24a" : "#fff2c2";
      ctx.fillRect(
        Math.round(NET_PX + Math.cos(a) * e * 16) - 1,
        Math.round(cyImpact + Math.sin(a) * e * 16) - 1,
        2,
        2
      );
    }
    ctx.globalAlpha = 1;
  }
}

// Great Wall — a tall battlemented stone wall rises in front of the defender;
// the ball thuds into it and drops. A grander cousin of the glass Wall Defense.
function drawGreatWall(ctx: CanvasRenderingContext2D, p: number, g: FxGeom) {
  const rise = Math.min(1, p / 0.32);
  const toNet = g.ax < NET_PX ? 16 : -16; // stand the wall toward the centre net
  const wx = Math.round(g.ax + toNet);
  const fullH = 46;
  const h = fullH * rise;
  const wHalf = 13;
  const base = g.vy + 16; // foot of the wall, a touch below the defender
  const topY = base - h;
  // stone body
  ctx.fillStyle = "#8a7b63";
  ctx.fillRect(wx - wHalf, Math.round(topY), wHalf * 2, Math.round(h));
  // brick courses — offset rows of mortar lines
  ctx.strokeStyle = "rgba(40,32,24,0.55)";
  ctx.lineWidth = 1;
  const courseH = 6;
  for (let y = base - courseH; y > topY; y -= courseH) {
    ctx.beginPath();
    ctx.moveTo(wx - wHalf, Math.round(y) + 0.5);
    ctx.lineTo(wx + wHalf, Math.round(y) + 0.5);
    ctx.stroke();
    const row = Math.round((base - y) / courseH);
    const offset = row % 2 ? 0 : Math.round(wHalf / 2); // stagger the vertical joints
    for (let x = wx - wHalf + offset; x < wx + wHalf; x += wHalf) {
      ctx.beginPath();
      ctx.moveTo(Math.round(x) + 0.5, Math.round(y));
      ctx.lineTo(Math.round(x) + 0.5, Math.round(y) + courseH);
      ctx.stroke();
    }
  }
  // crenellated battlement along the top (merlons), once it's near full height
  if (rise > 0.6) {
    ctx.fillStyle = "#9a8b70";
    for (let i = -1; i <= 1; i++) {
      ctx.fillRect(wx + i * 9 - 3, Math.round(topY) - 4, 6, 5);
    }
    // lit top edge for a little depth
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.fillRect(wx - wHalf, Math.round(topY), wHalf * 2, 1);
  }
  // the ball thuds in and drops down the face
  if (p > 0.34 && p < 0.7) {
    const e = (p - 0.34) / 0.36;
    const bx = wx + (toNet > 0 ? -wHalf - 3 : wHalf + 3);
    const by = topY + 6 + e * (h - 10);
    ctx.fillStyle = "#e8f94a";
    circle(ctx, bx, by, 2.2);
    // dust puff on contact
    if (e < 0.3) {
      ctx.globalAlpha = (0.3 - e) / 0.3;
      ctx.fillStyle = "#cbbfa6";
      for (let i = 0; i < 4; i++) {
        ctx.fillRect(Math.round(bx + (i - 1.5) * 2), Math.round(by - 2 - i), 1, 1);
      }
      ctx.globalAlpha = 1;
    }
  }
  ctx.globalAlpha = 1;
}

// Tornado — a swirling funnel drops onto the opponent (who is spun "berputar
// putar" via AvatarPose.spin in MatchSim). Stacked rotating bands + orbiting
// debris + a dust skirt at the base.
function drawTornado(ctx: CanvasRenderingContext2D, p: number, g: FxGeom, seed: number) {
  const drop = Math.min(1, p / 0.28); // funnel descends, then lingers
  const spin = p * Math.PI * 8 + seed; // matches the victim's whirl
  const baseY = g.vy + 10;
  const topY = COURT_TOP - 6;
  const reach = topY + (baseY - topY) * drop; // how far down the tip has reached
  const bands = 9;
  // body: stacked elliptical bands, narrow at the tip, flaring to the top
  for (let i = 0; i < bands; i++) {
    const u = i / (bands - 1); // 0 at tip, 1 at top
    const by = lerp(baseY, topY, u);
    if (by > reach) continue; // not yet descended this far
    const rx = 3 + u * 16;
    const sway = Math.sin(spin + u * 4) * (2 + u * 3);
    ctx.globalAlpha = 0.18 + 0.22 * (1 - u);
    ctx.fillStyle = i % 2 ? "#cfd6de" : "#9aa3ad";
    ctx.beginPath();
    ctx.ellipse(g.vx + sway, by, rx, 2.2 + u * 1.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // a couple of swirling highlight strands spiralling up the funnel
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = "#eef2f6";
  ctx.lineWidth = 1;
  for (let s = 0; s < 2; s++) {
    ctx.beginPath();
    let started = false;
    for (let i = 0; i <= bands; i++) {
      const u = i / bands;
      const by = lerp(baseY, topY, u);
      if (by > reach) continue;
      const rx = 3 + u * 16;
      const a = spin + u * 6 + s * Math.PI;
      const x = g.vx + Math.sin(spin + u * 4) * (2 + u * 3) + Math.cos(a) * rx;
      if (started) ctx.lineTo(x, by);
      else {
        ctx.moveTo(x, by);
        started = true;
      }
    }
    ctx.stroke();
  }
  // debris orbiting the victim
  ctx.globalAlpha = 0.85;
  for (let i = 0; i < 7; i++) {
    const a = spin * (1 + i * 0.05) + i * 1.1;
    const r = 6 + (i % 3) * 5 + Math.sin(spin + i) * 2;
    ctx.fillStyle = i % 2 ? "#c8b78f" : "#8f8a82";
    ctx.fillRect(
      Math.round(g.vx + Math.cos(a) * r) - 1,
      Math.round(g.vy - 2 + Math.sin(a) * r * 0.5) - 1,
      2,
      2
    );
  }
  // dust skirt kicked up at the base
  ctx.globalAlpha = 0.4;
  ctx.fillStyle = "#b8ad97";
  for (let i = 0; i < 6; i++) {
    const a = spin * 1.3 + i;
    ctx.fillRect(Math.round(g.vx + Math.cos(a) * (6 + i)) - 1, Math.round(baseY + 2), 2, 1);
  }
  ctx.globalAlpha = 1;
}

// Net Storm (volley) — a flurry of reflex volleys at the tape: the ball blurs
// back and forth a few times between the two front players, then one sharp
// putaway flashes into the victim. Quick, twitchy, close-range.
function drawVolley(
  ctx: CanvasRenderingContext2D,
  p: number,
  g: FxGeom,
  color: string,
  seed: number
) {
  const hit = 0.5;
  if (p < hit) {
    const t = p / hit;
    const exchanges = 4; // back-and-forth volleys before the putaway
    const phase = t * exchanges;
    const leg = Math.floor(phase);
    const u = phase - leg;
    // alternate ends each volley; ride a shallow arc between them
    const fromAtt = leg % 2 === 0;
    const x0 = fromAtt ? g.ax : g.vx;
    const y0 = fromAtt ? g.ay : g.vy;
    const x1 = fromAtt ? g.vx : g.ax;
    const y1 = fromAtt ? g.vy : g.ay;
    const bx = lerp(x0, x1, u);
    const by = lerp(y0, y1, u) - 6 * Math.sin(Math.PI * u);
    // motion-blur ghosts trailing the ball
    for (let i = 3; i >= 1; i--) {
      const uu = clamp(u - i * 0.12, 0, 1);
      ctx.globalAlpha = 0.18 * (1 - i / 4);
      ctx.fillStyle = color;
      ctx.fillRect(Math.round(lerp(x0, x1, uu)) - 1, Math.round(lerp(y0, y1, uu)) - 1, 2, 2);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#e8f94a";
    circle(ctx, bx, by, 2);
    // little contact flick at whichever racket just hit
    if (u < 0.2) {
      ctx.globalAlpha = 1 - u / 0.2;
      ctx.fillStyle = "#ffffff";
      star(ctx, x0, y0, 5, 2);
      ctx.globalAlpha = 1;
    }
  } else {
    const e = (p - hit) / (1 - hit);
    // the putaway lands: a crisp burst + a couple of speed jabs
    ctx.globalAlpha = Math.max(0, 1 - e);
    ctx.fillStyle = "#fff2c2";
    star(ctx, g.vx, g.vy, 5 + e * 8, 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      const a = i * ((Math.PI * 2) / 5) + seed;
      ctx.beginPath();
      ctx.moveTo(g.vx + Math.cos(a) * 3, g.vy + Math.sin(a) * 3);
      ctx.lineTo(g.vx + Math.cos(a) * (6 + e * 12), g.vy + Math.sin(a) * (6 + e * 12));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}

// Backhand Whip — a whipped backhand cross: a curved crescent blade sweeps from
// the striker to the victim, bowing out to one side, then snaps into a little
// curl of sidespin on contact.
function drawBackhand(
  ctx: CanvasRenderingContext2D,
  p: number,
  g: FxGeom,
  color: string,
  seed: number
) {
  const hit = 0.42;
  const t = clamp(p / hit, 0, 1);
  // perpendicular bow direction so the slash arcs across, not straight.
  const ang = Math.atan2(g.vy - g.ay, g.vx - g.ax);
  const perp = ang + Math.PI / 2;
  const bow = 16; // how far the crescent bellies out
  // the swept blade: a tapering curved stroke that draws on as it travels.
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  const steps = 16;
  let started = false;
  for (let i = 0; i <= steps; i++) {
    const u = (i / steps) * t;
    const bx = lerp(g.ax, g.vx, u) + Math.cos(perp) * bow * Math.sin(Math.PI * u);
    const by = lerp(g.ay, g.vy, u) + Math.sin(perp) * bow * Math.sin(Math.PI * u);
    if (started) ctx.lineTo(bx, by);
    else {
      ctx.moveTo(bx, by);
      started = true;
    }
  }
  ctx.stroke();
  // a brighter leading crescent at the blade's tip
  const tx = lerp(g.ax, g.vx, t) + Math.cos(perp) * bow * Math.sin(Math.PI * t);
  const ty = lerp(g.ay, g.vy, t) + Math.sin(perp) * bow * Math.sin(Math.PI * t);
  ctx.fillStyle = "#eafff7";
  circle(ctx, tx, ty, 2.4);
  // sidespin curl + sting on contact
  if (p >= hit) {
    const e = (p - hit) / (1 - hit);
    ctx.globalAlpha = Math.max(0, 1 - e);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i <= 10; i++) {
      const a = -e * Math.PI * 1.6 + (i / 10) * Math.PI * 1.6;
      const r = 3 + e * 9;
      const x = g.vx + Math.cos(a) * r;
      const y = g.vy + Math.sin(a) * r;
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    ctx.stroke();
    ctx.fillStyle = "#d6f7ec";
    for (let i = 0; i < 4; i++) {
      const a = i * 1.6 + seed;
      ctx.fillRect(
        Math.round(g.vx + Math.cos(a) * e * 11) - 1,
        Math.round(g.vy + Math.sin(a) * e * 11) - 1,
        2,
        2
      );
    }
    ctx.globalAlpha = 1;
  }
}

// Forehand Drive — a flat, heavy power drive: a thick tracer bolts dead-straight
// from striker to victim with chevron speed marks chasing it, then a flat
// horizontal shockwave pops on impact.
function drawForehand(
  ctx: CanvasRenderingContext2D,
  p: number,
  g: FxGeom,
  color: string,
  seed: number
) {
  const hit = 0.4;
  const ang = Math.atan2(g.vy - g.ay, g.vx - g.ax);
  if (p < hit) {
    const t = p / hit;
    const bx = lerp(g.ax, g.vx, t);
    const by = lerp(g.ay, g.vy, t);
    // thick straight tracer from the racket up to the ball
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(g.ax, g.ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
    // chevron speed marks chasing the ball
    ctx.strokeStyle = "#eafff7";
    ctx.lineWidth = 1;
    for (let i = 1; i <= 3; i++) {
      const uu = clamp(t - i * 0.1, 0, 1);
      const cxp = lerp(g.ax, g.vx, uu);
      const cyp = lerp(g.ay, g.vy, uu);
      const back = ang + Math.PI;
      const wing = 2.6;
      ctx.globalAlpha = 0.8 * (1 - i / 4);
      ctx.beginPath();
      ctx.moveTo(cxp + Math.cos(back + 0.5) * 4 * wing, cyp + Math.sin(back + 0.5) * 4 * wing);
      ctx.lineTo(cxp, cyp);
      ctx.lineTo(cxp + Math.cos(back - 0.5) * 4 * wing, cyp + Math.sin(back - 0.5) * 4 * wing);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // the driven ball
    ctx.fillStyle = "#e8f94a";
    circle(ctx, bx, by, 2.6);
  } else {
    const e = (p - hit) / (1 - hit);
    // flat horizontal shockwave — a wide, thin ellipse blowing outward
    ctx.globalAlpha = Math.max(0, 1 - e);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(g.vx, g.vy, 6 + e * 22, 3 + e * 6, 0, 0, Math.PI * 2);
    ctx.stroke();
    // a hard white flash core
    if (e < 0.4) {
      ctx.globalAlpha = 1 - e / 0.4;
      ctx.fillStyle = "#ffffff";
      circle(ctx, g.vx, g.vy, 2 + 5 * (1 - e / 0.4));
    }
    // debris sprayed along the line of fire
    ctx.globalAlpha = Math.max(0, 1 - e);
    for (let i = 0; i < 7; i++) {
      const d = e * (8 + 18 * rand(seed, i));
      ctx.fillStyle = i % 2 ? "#fff2c2" : color;
      ctx.fillRect(
        Math.round(g.vx + Math.cos(ang) * d) - 1,
        Math.round(g.vy + Math.sin(ang) * d + (rand(seed, i + 5) - 0.5) * 8) - 1,
        2,
        2
      );
    }
    ctx.globalAlpha = 1;
  }
}

// Counter Return — reads the incoming shot and rifles it back: the ball arrives
// from the victim's side to the striker, a parry flashes, then a bright bolt
// rockets back the other way with a redirect chevron and bursts on the victim.
function drawReturn(
  ctx: CanvasRenderingContext2D,
  p: number,
  g: FxGeom,
  color: string,
  seed: number
) {
  const turn = 0.4; // when the read flips into the counter
  const ang = Math.atan2(g.vy - g.ay, g.vx - g.ax);
  if (p < turn) {
    const t = p / turn;
    // incoming ball: victim → striker, dotted, decelerating into the read
    const bx = lerp(g.vx, g.ax, t);
    const by = lerp(g.vy, g.ay, t);
    ctx.fillStyle = "#9aa3ad";
    for (let i = 0; i < 4; i++) {
      const uu = clamp(t - i * 0.12, 0, 1);
      ctx.globalAlpha = 0.6 * (1 - i / 4);
      ctx.fillRect(Math.round(lerp(g.vx, g.ax, uu)) - 1, Math.round(lerp(g.vy, g.ay, uu)) - 1, 2, 2);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#e8f94a";
    circle(ctx, bx, by, 2.2);
    // a parry flash building at the striker as the read locks in
    if (t > 0.6) {
      ctx.globalAlpha = (t - 0.6) / 0.4;
      ctx.fillStyle = "#ffffff";
      star(ctx, g.ax, g.ay, 6, 2);
      ctx.globalAlpha = 1;
    }
  } else {
    const e = (p - turn) / (1 - turn);
    const hitU = 0.7; // fraction of the counter at which it lands
    if (e < hitU) {
      const t = e / hitU;
      const bx = lerp(g.ax, g.vx, t);
      const by = lerp(g.ay, g.vy, t);
      // the counter bolt: a bright streak striker → victim
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(g.ax, g.ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
      // redirect chevron pointing the new way
      const fwd = ang;
      ctx.strokeStyle = "#eafff7";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(bx + Math.cos(fwd + 2.5) * 5, by + Math.sin(fwd + 2.5) * 5);
      ctx.lineTo(bx, by);
      ctx.lineTo(bx + Math.cos(fwd - 2.5) * 5, by + Math.sin(fwd - 2.5) * 5);
      ctx.stroke();
      ctx.fillStyle = "#e8f94a";
      circle(ctx, bx, by, 2.4);
    } else {
      const f = (e - hitU) / (1 - hitU);
      // burst on the victim
      ctx.globalAlpha = Math.max(0, 1 - f);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(g.vx, g.vy, 4 + f * 14, 0, Math.PI * 2);
      ctx.stroke();
      for (let i = 0; i < 6; i++) {
        const a = i * ((Math.PI * 2) / 6) + seed;
        ctx.fillStyle = i % 2 ? "#fff2c2" : color;
        ctx.fillRect(
          Math.round(g.vx + Math.cos(a) * f * 14) - 1,
          Math.round(g.vy + Math.sin(a) * f * 14) - 1,
          2,
          2
        );
      }
      ctx.globalAlpha = 1;
    }
  }
}

// Ball Barrage — a flurry of balls hammered one after another: a strung-out stream
// of balls streaks from the striker to the victim, each launched a beat apart with
// a muzzle flash and a motion-blur tail, then the final ball detonates and the
// whole volley scatters off the victim. The multi-ball overwhelming attack.
function drawBarrage(
  ctx: CanvasRenderingContext2D,
  p: number,
  g: FxGeom,
  color: string,
  seed: number
) {
  const hit = 0.5;
  const N = 6; // balls in the volley
  if (p < hit) {
    const t = p / hit;
    for (let i = 0; i < N; i++) {
      const delay = i * 0.13;
      const u = clamp((t - delay) / (1 - delay), 0, 1);
      if (u <= 0) continue;
      const bx = lerp(g.ax, g.vx, u);
      const by = lerp(g.ay, g.vy, u) - 18 * Math.sin(Math.PI * u);
      // motion-blur tail behind each ball
      for (let k = 1; k <= 2; k++) {
        const uu = clamp(u - k * 0.06, 0, 1);
        ctx.globalAlpha = 0.2 * (1 - k / 3);
        ctx.fillStyle = color;
        ctx.fillRect(
          Math.round(lerp(g.ax, g.vx, uu)) - 1,
          Math.round(lerp(g.ay, g.vy, uu) - 18 * Math.sin(Math.PI * uu)) - 1,
          2,
          2
        );
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#e8f94a";
      circle(ctx, bx, by, 2.2);
      // muzzle flash as each ball leaves the racket
      if (u < 0.12) {
        ctx.globalAlpha = 1 - u / 0.12;
        ctx.fillStyle = "#fff2c2";
        star(ctx, g.ax, g.ay, 6, 2);
        ctx.globalAlpha = 1;
      }
      // a pop where a ball thuds into the victim
      if (u > 0.92) {
        ctx.globalAlpha = (u - 0.92) / 0.08;
        ctx.fillStyle = "#ffffff";
        circle(ctx, g.vx, g.vy, 3);
        ctx.globalAlpha = 1;
      }
    }
  } else {
    const e = (p - hit) / (1 - hit);
    // the final ball detonates: an expanding ring + a scatter of balls bouncing off
    ctx.globalAlpha = Math.max(0, 1 - e);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(g.vx, g.vy, 6 + e * 20, 0, Math.PI * 2);
    ctx.stroke();
    for (let i = 0; i < N; i++) {
      const a = i * ((Math.PI * 2) / N) + seed;
      const d = e * (10 + 16 * rand(seed, i));
      ctx.fillStyle = "#e8f94a";
      circle(ctx, g.vx + Math.cos(a) * d, g.vy + Math.sin(a) * d - e * 6, 2);
    }
    if (e < 0.4) {
      ctx.globalAlpha = 1 - e / 0.4;
      ctx.fillStyle = "#ffffff";
      circle(ctx, g.vx, g.vy, 3 + 6 * (1 - e / 0.4));
    }
    ctx.globalAlpha = 1;
  }
}

// Meteor Shower — a rain of overheads crashing down from above: several flaming
// balls streak down on slanted trails into a spread around the victim, each
// splashing as it lands, then a final fireball blast throws embers and curling
// smoke. The other multi-ball attack, coming from the sky rather than head-on.
function drawMeteor(ctx: CanvasRenderingContext2D, p: number, g: FxGeom, seed: number) {
  const hit = 0.5;
  const N = 6; // meteors raining in
  if (p < hit) {
    const t = p / hit;
    for (let i = 0; i < N; i++) {
      const delay = i * 0.1;
      const u = clamp((t - delay) / (1 - delay), 0, 1);
      if (u <= 0) continue;
      const tx = g.vx + (i - (N - 1) / 2) * 6 + (rand(seed, i) - 0.5) * 6;
      const sx0 = tx - 22; // start up and to the side, fall in on a slant
      const sy0 = COURT_TOP - 14;
      const mx = lerp(sx0, tx, u);
      const my = lerp(sy0, g.vy, u);
      // fiery trail streaming behind the meteor
      for (let k = 1; k <= 4; k++) {
        const uu = clamp(u - k * 0.05, 0, 1);
        ctx.globalAlpha = 0.4 * (1 - k / 5);
        ctx.fillStyle = k % 2 ? "#ff7a1a" : "#ffd24a";
        ctx.fillRect(Math.round(lerp(sx0, tx, uu)), Math.round(lerp(sy0, g.vy, uu)), 2, 2);
      }
      ctx.globalAlpha = 1;
      // the burning head
      ctx.fillStyle = "#ff5c5c";
      circle(ctx, mx, my, 2.6);
      ctx.fillStyle = "#ffe98a";
      circle(ctx, mx, my, 1.2);
      // a splash ring where a meteor lands
      if (u > 0.9) {
        const f = (u - 0.9) / 0.1;
        ctx.globalAlpha = f;
        ctx.strokeStyle = "#ff9d2a";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(tx, g.vy, 4 * f + 1, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
  } else {
    const e = (p - hit) / (1 - hit);
    const R = 6 + e * 20;
    // final blast ring
    ctx.globalAlpha = Math.max(0, 1 - e);
    ctx.strokeStyle = "#ff9d2a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(g.vx, g.vy, R, 0, Math.PI * 2);
    ctx.stroke();
    // flying embers
    for (let i = 0; i < 10; i++) {
      const a = i * ((Math.PI * 2) / 10) + seed;
      const d = R * (0.5 + 0.5 * rand(seed, i));
      ctx.fillStyle = i % 2 ? "#ffd24a" : "#ff5c5c";
      ctx.fillRect(
        Math.round(g.vx + Math.cos(a) * d) - 1,
        Math.round(g.vy + Math.sin(a) * d - e * 10) - 1,
        2,
        2
      );
    }
    // hot white core
    if (e < 0.4) {
      ctx.globalAlpha = 1 - e / 0.4;
      ctx.fillStyle = "#fff2c2";
      circle(ctx, g.vx, g.vy, 3 + 6 * (1 - e / 0.4));
    }
    // dark smoke curling up as it dies down
    if (e > 0.4) {
      ctx.globalAlpha = (e - 0.4) * 0.5;
      ctx.fillStyle = "#5a5450";
      for (let i = 0; i < 4; i++) {
        ctx.fillRect(
          Math.round(g.vx + (rand(seed, i) - 0.5) * 12),
          Math.round(g.vy - 8 - e * 14 - i * 3),
          3,
          3
        );
      }
    }
    ctx.globalAlpha = 1;
  }
}
