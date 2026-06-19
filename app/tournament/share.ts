import { ROUND_LABEL, type RoundName, type Tournament } from "@/lib/sim/tournament";

// Builds a shareable summary of *your* tournament run and renders it both as a
// social-ready PNG card and a plain-text caption, then hands them to the Web
// Share API (with a download + clipboard fallback). Client-only — it touches the
// DOM canvas, navigator.share and the clipboard — so it lives apart from the pure
// sim and is imported only by the client arena.

const ROUND_ORDER: RoundName[] = ["QF", "SF", "F"];

export interface RunMatch {
  round: RoundName;
  roundLabel: string;
  you: string;
  youPro: string;
  opp: string;
  oppPro: string;
  youScore: number;
  oppScore: number;
  bestOf3: boolean;
  won: boolean;
}

export interface RunSummary {
  you: string;
  status: "champion" | "out" | "alive";
  headline: string;
  matches: RunMatch[];
  seed: number;
}

// Distil the run into the matches whose result the player has actually seen
// (round index ≤ throughRoundIndex), so a share never spoils an unrevealed round.
// You always sit on side A of every pairing you reach (see tournament.ts), so
// "you" is `match.a` and an "A" result means you won.
export function buildRunSummary(t: Tournament, throughRoundIndex: number): RunSummary | null {
  const matches: RunMatch[] = [];
  t.rounds.forEach((round, i) => {
    if (i > throughRoundIndex) return;
    const m = round.matches.find((mm) => mm.isYours);
    if (!m) return;
    const won = m.result.winner === "A";
    const youScore = m.bestOf === 3 ? m.result.gameWins.a : m.result.games[0]?.a ?? 0;
    const oppScore = m.bestOf === 3 ? m.result.gameWins.b : m.result.games[0]?.b ?? 0;
    matches.push({
      round: m.round,
      roundLabel: ROUND_LABEL[m.round],
      you: m.a.entry.name,
      youPro: m.a.pro.name,
      opp: m.b.entry.name,
      oppPro: m.b.pro.name,
      youScore,
      oppScore,
      bestOf3: m.bestOf === 3,
      won,
    });
  });

  if (matches.length === 0) return null;

  const last = matches[matches.length - 1];
  let status: RunSummary["status"];
  let headline: string;
  if (last.won && last.round === "F") {
    status = "champion";
    headline = "Tournament champion";
  } else if (!last.won) {
    status = "out";
    headline = `Knocked out in the ${last.roundLabel.toLowerCase()}`;
  } else {
    status = "alive";
    const nextIdx = ROUND_ORDER.indexOf(last.round) + 1;
    const next = ROUND_ORDER[nextIdx];
    headline = next ? `Through to the ${ROUND_LABEL[next].toLowerCase()}` : "Marching on";
  }

  return { you: last.you, status, headline, matches, seed: t.seed };
}

// The plain-text caption that rides along with the image.
export function buildShareText(s: RunSummary): string {
  const icon = s.status === "champion" ? "🏆" : s.status === "out" ? "🎾" : "🔥";
  const lines = [`${icon} ${s.you} — ${s.headline}`, ""];
  for (const m of s.matches) {
    const verb = m.won ? "beat" : "lost to";
    lines.push(`${m.roundLabel}: ${verb} ${m.opp} & ${m.oppPro} ${m.youScore}–${m.oppScore}`);
  }
  lines.push("", "Drawn on expose.padel-leaderboard");
  return lines.join("\n");
}

// --- image card -------------------------------------------------------------

const CARD_W = 1080;
const CARD_H = 566; // ~1.91:1, the common social link-preview ratio
const GREEN = "#003c33";
const CORAL = "#ff7759";
const INK = "#212121";

// Render the summary to an off-screen canvas as a branded share card.
export function renderSummaryCanvas(s: RunSummary): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  // Body.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  // Header band.
  const headerH = 150;
  ctx.fillStyle = GREEN;
  ctx.fillRect(0, 0, CARD_W, headerH);

  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.font = "600 22px ui-monospace, monospace";
  ctx.fillText("PADEL TOURNAMENT", 56, 56);

  ctx.fillStyle = "#ffffff";
  ctx.font = "700 46px 'Space Grotesk', Inter, system-ui, sans-serif";
  ctx.fillText(s.you, 56, 108);

  // Status pill on the right of the header.
  const pillText = s.status === "champion" ? "🏆 CHAMPION" : s.status === "out" ? "ELIMINATED" : "STILL ALIVE";
  const pillColor = s.status === "champion" ? "#f5c518" : s.status === "out" ? CORAL : "#7fe6cf";
  ctx.font = "700 26px ui-monospace, monospace";
  const pw = ctx.measureText(pillText).width + 44;
  const px = CARD_W - 56 - pw;
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  roundRect(ctx, px, 50, pw, 48, 24);
  ctx.fill();
  ctx.fillStyle = pillColor;
  ctx.fillText(pillText, px + 22, 82);

  // Headline.
  ctx.fillStyle = INK;
  ctx.font = "600 34px 'Space Grotesk', Inter, system-ui, sans-serif";
  ctx.fillText(s.headline, 56, headerH + 64);

  // Match rows.
  let y = headerH + 116;
  const rowH = 64;
  for (const m of s.matches) {
    // Round tag.
    ctx.fillStyle = m.won ? GREEN : CORAL;
    ctx.font = "700 20px ui-monospace, monospace";
    ctx.fillText(m.round, 56, y);

    // Result line.
    ctx.fillStyle = INK;
    ctx.font = "400 26px Inter, system-ui, sans-serif";
    const verb = m.won ? "beat" : "lost to";
    const line = `${verb} ${m.opp} & ${m.oppPro}`;
    ctx.fillText(trunc(ctx, line, 720), 120, y);

    // Score on the right.
    ctx.font = "700 30px ui-monospace, monospace";
    ctx.fillStyle = m.won ? GREEN : CORAL;
    const score = `${m.youScore}–${m.oppScore}`;
    ctx.textAlign = "right";
    ctx.fillText(score, CARD_W - 56, y);
    ctx.textAlign = "left";

    y += rowH;
  }

  // Footer.
  ctx.fillStyle = "#93939f";
  ctx.font = "500 22px ui-monospace, monospace";
  ctx.fillText("expose.padel-leaderboard", 56, CARD_H - 36);

  return canvas;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function trunc(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + "…").width > maxW) t = t.slice(0, -1);
  return t + "…";
}

export type ShareOutcome = "shared" | "downloaded" | "cancelled" | "error";

// Try the Web Share API with the rendered PNG (best on mobile — lands straight in
// the native share sheet for any social app). Where files can't be shared, fall
// back to downloading the card and copying the caption to the clipboard.
export async function shareSummary(s: RunSummary): Promise<ShareOutcome> {
  const canvas = renderSummaryCanvas(s);
  const text = buildShareText(s);
  const title = s.status === "champion" ? `${s.you} won the tournament!` : `${s.you} — ${s.headline}`;

  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
  if (!blob) return "error";
  const file = new File([blob], "padel-tournament.png", { type: "image/png" });

  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], text, title });
      return "shared";
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return "cancelled";
      // fall through to download on any other failure
    }
  }

  // Fallback: download the image and copy the caption.
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "padel-tournament.png";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  try {
    await navigator.clipboard?.writeText(text);
  } catch {
    /* clipboard may be blocked — the image still downloaded */
  }
  return "downloaded";
}
