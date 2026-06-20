import { BRAND, type CardSpec } from "@/lib/share/card";
import { ROUND_LABEL, type RoundName, type Tournament } from "@/lib/sim/tournament";

// Builds a shareable summary of *your* tournament run as a CardSpec (rendered to
// a PNG by the shared share-card layer) plus a plain-text caption. Pure data
// shaping — the DOM canvas / navigator.share plumbing lives in lib/share.

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

// Shape the run into a CardSpec for the shared share-card renderer.
export function buildRunCard(s: RunSummary): CardSpec {
  const pill =
    s.status === "champion"
      ? { text: "🏆 CHAMPION", color: BRAND.amber }
      : s.status === "out"
        ? { text: "ELIMINATED", color: BRAND.coral }
        : { text: "STILL ALIVE", color: BRAND.mint };

  return {
    kicker: "Padel Tournament",
    title: s.you,
    pill,
    headline: s.headline,
    rows: s.matches.map((m) => ({
      tag: m.round,
      accent: m.won,
      title: `${m.won ? "beat" : "lost to"} ${m.opp} & ${m.oppPro}`,
      value: `${m.youScore}–${m.oppScore}`,
      tagColor: m.won ? BRAND.green : BRAND.coral,
      valueColor: m.won ? BRAND.green : BRAND.coral,
    })),
  };
}

// The share-sheet title that rides along with the card.
export function buildShareTitle(s: RunSummary): string {
  return s.status === "champion" ? `${s.you} won the tournament!` : `${s.you} — ${s.headline}`;
}
