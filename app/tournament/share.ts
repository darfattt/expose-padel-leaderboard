import { proxiedImage } from "@/lib/img-proxy";
import { proAvatarColor, proInitials, proPhoto } from "@/lib/pros";
import { BRAND, type CardCourt, type CardSpec } from "@/lib/share/card";
import type { AvatarSpec } from "@/lib/sim/avatar";
import type { MatchScript } from "@/lib/sim/engine";
import type { Skill } from "@/lib/sim/skills";
import { type PlayedMatch, ROUND_LABEL, type RoundName, type Tournament } from "@/lib/sim/tournament";

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
  // Personal flourishes for the share card, read from your latest rendered match.
  // All optional — without a rendered match (the degraded path) the card falls
  // back to the plain results layout with its status pill.
  youAvatar?: AvatarSpec | null; // your 8-bit sprite — the header portrait base
  youPhotoUrl?: string | null; // your real Reclub photo, drawn over the sprite
  proName?: string | null; // your fixed partner pro
  proPhotoUrl?: string | null; // their headshot (proxied CORS-clean) — the header twin
  proInitials?: string;
  proColor?: string;
  skills?: Skill[]; // your team's signature moves in play this run
  scene?: CardCourt | null; // the post-match court still of your latest result
  highlights?: Highlight[]; // play-by-play beats from your latest game (fills the card)
}

// One beat in the share card's play-by-play reel: a short line of commentary with
// the running score it left behind. Distilled from the same deterministic game
// script the live arena narrates, so the card recap and the tape never disagree.
export interface Highlight {
  text: string;
  score: string;
}

// First name only — keeps the play-by-play lines short enough for a card row.
function shortName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

// Distil a rendered game into a short, chronological highlight reel — the beats
// worth retelling (signature flashes, clinch points, momentum surges, the
// match-winner) with the score each left. You are always team A, so an "A" winner
// is you. This is what fills the lower third of the share card instead of blank
// space, reading like a recap of the game shown in the court still.
export function gameHighlights(script: MatchScript): Highlight[] {
  const pts = script.points;
  if (!pts.length) return [];
  const you = shortName(script.teamA.playerName);
  const opp = shortName(script.teamB.playerName);
  const who = (s: "A" | "B") => (s === "A" ? you : opp);

  const reel: Highlight[] = [];
  let run = 0; // current win streak length for `runTeam`
  let runTeam: "A" | "B" | null = null;

  pts.forEach((pt, i) => {
    if (pt.winner === runTeam) run += 1;
    else {
      runTeam = pt.winner;
      run = 1;
    }
    const score = `${pt.scoreA}–${pt.scoreB}`;
    const w = who(pt.winner);

    if (i === pts.length - 1) {
      // The decider — always kept (see capReel).
      reel.push({
        text: pt.winner === "A" ? `${you} convert — game over!` : `${opp} take the decider.`,
        score,
      });
    } else if (pt.skill) {
      reel.push({ text: `✦ ${pt.skill.skill.name} — ${w} dazzle.`, score });
    } else if (pt.big) {
      reel.push({ text: `Clinch point — ${w} hold their nerve.`, score });
    } else if (run === 4) {
      reel.push({ text: `${w} reel off four in a row.`, score });
    } else if (i === 0) {
      reel.push({ text: `${who(pt.server)} get us underway.`, score });
    }
  });

  return capReel(reel, 6);
}

// Trim the reel to a card-friendly length, always keeping the finale (the last
// entry) — drop from the middle so the opener and the game-winner both survive.
function capReel(reel: Highlight[], max: number): Highlight[] {
  if (reel.length <= max) return reel;
  return [...reel.slice(0, max - 1), reel[reel.length - 1]];
}

// Distil the run into the matches whose result the player has actually seen
// (round index ≤ throughRoundIndex), so a share never spoils an unrevealed round.
// You always sit on side A of every pairing you reach (see tournament.ts), so
// "you" is `match.a` and an "A" result means you won.
export function buildRunSummary(t: Tournament, throughRoundIndex: number): RunSummary | null {
  const matches: RunMatch[] = [];
  let lastPlayed: PlayedMatch | null = null;
  t.rounds.forEach((round, i) => {
    if (i > throughRoundIndex) return;
    const m = round.matches.find((mm) => mm.isYours);
    if (!m) return;
    lastPlayed = m;
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

  const summary: RunSummary = { you: last.you, status, headline, matches, seed: t.seed };

  // Read the rich card extras off your latest *rendered* match: the team specs
  // (sprites + skills) live on its per-game scripts; your real photo on the team
  // entry. The scene mirrors the last game's end frame (positions, score, banner).
  const played = lastPlayed as PlayedMatch | null;
  const scripts = played?.scripts;
  const lastScript = scripts?.[scripts.length - 1];
  if (played && lastScript) {
    const youTeam = lastScript.teamA;
    const oppTeam = lastScript.teamB;
    const proName = youTeam.proName;
    const verb = status === "champion" ? "are CHAMPIONS —" : last.won ? "win" : "lose";

    summary.youAvatar = youTeam.avatars[0];
    summary.youPhotoUrl = t.teams.find((tm) => tm.isYou)?.entry.avatarUrl ?? null;
    summary.proName = proName;
    summary.proPhotoUrl = proxiedImage(proPhoto(proName) ?? null);
    summary.proInitials = proInitials(proName);
    summary.proColor = proAvatarColor(proName);
    summary.skills = youTeam.skills;
    summary.highlights = gameHighlights(lastScript);
    summary.scene = {
      teamAName: youTeam.playerName,
      teamBName: oppTeam.playerName,
      scoreA: lastScript.finalScore.a,
      scoreB: lastScript.finalScore.b,
      players: [
        { avatar: youTeam.avatars[0], name: youTeam.playerName },
        { avatar: youTeam.avatars[1], name: youTeam.proName },
        { avatar: oppTeam.avatars[0], name: oppTeam.playerName },
        { avatar: oppTeam.avatars[1], name: oppTeam.proName },
      ],
      bannerText: `${youTeam.playerName} & ${youTeam.proName} ${verb} ${lastScript.finalScore.a}–${lastScript.finalScore.b}`,
      win: lastScript.winner === "A",
    };
  }

  return summary;
}

// The plain-text caption that rides along with the image.
export function buildShareText(s: RunSummary): string {
  const icon = s.status === "champion" ? "🏆" : s.status === "out" ? "🎾" : "🔥";
  const lines = [`${icon} ${s.you} — ${s.headline}`, ""];
  for (const m of s.matches) {
    const verb = m.won ? "beat" : "lost to";
    lines.push(`${m.roundLabel}: ${verb} ${m.opp} & ${m.oppPro} ${m.youScore}–${m.oppScore}`);
  }
  if (s.skills?.length) {
    lines.push("", "Signature moves:");
    for (const sk of s.skills) lines.push(`✦ ${sk.name}`);
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

  // The two header portraits (you + your pro twin) carry the status visually, so
  // the pill is dropped when they're present to avoid colliding top-right. The
  // degraded path (no rendered match) keeps the pill.
  const hasPortrait = !!(s.youAvatar || s.youPhotoUrl);

  const matchRows: CardSpec["rows"] = s.matches.map((m) => ({
    tag: m.round,
    accent: m.won,
    title: `${m.won ? "beat" : "lost to"} ${m.opp} & ${m.oppPro}`,
    value: `${m.youScore}–${m.oppScore}`,
    tagColor: m.won ? BRAND.green : BRAND.coral,
    valueColor: m.won ? BRAND.green : BRAND.coral,
  }));

  // Play-by-play from your latest game — the dramatic beats with the running
  // score, recapping the match shown in the court still (and filling the lower
  // third of the tall Stories card instead of leaving it blank).
  const commentaryRows: CardSpec["rows"] = (s.highlights ?? []).map((h, i) => ({
    heading: i === 0 ? "💬 How it unfolded" : undefined,
    tag: "▸",
    title: h.text,
    value: h.score,
    tagColor: BRAND.muted,
    valueColor: BRAND.muted,
  }));

  // The signature moves your team brought to the bracket — gear, pro and kudos
  // skills, each with the one-line note shown in the live commentary legend.
  const skillRows: CardSpec["rows"] = (s.skills ?? []).map((sk, i) => ({
    heading: i === 0 ? "✦ Your signature moves" : undefined,
    title: sk.name,
    subtitle: sk.effect,
    tagColor: BRAND.green,
  }));

  return {
    kicker: "Padel Tournament",
    title: s.you,
    pill: hasPortrait ? null : pill,
    avatar: s.youAvatar ?? null,
    photoUrl: s.youPhotoUrl ?? null,
    proPortrait: s.proName
      ? {
          photoUrl: s.proPhotoUrl ?? null,
          initials: s.proInitials ?? "?",
          color: s.proColor ?? BRAND.green,
        }
      : null,
    headline: s.headline,
    court: s.scene ?? null,
    rows: [...matchRows, ...commentaryRows, ...skillRows],
    // Instagram Stories format: 1080 wide × a 1920 floor → a 9:16 portrait, body
    // pinned to the top.
    minHeight: 1920,
    bodyAlign: "top",
  };
}

// The share-sheet title that rides along with the card.
export function buildShareTitle(s: RunSummary): string {
  return s.status === "champion" ? `${s.you} won the tournament!` : `${s.you} — ${s.headline}`;
}
