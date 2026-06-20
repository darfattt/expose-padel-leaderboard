import type { PlayerCardMedia } from "./queries";
import { BRAND, type CardSpec } from "./share/card";
import { avatarFromName } from "./sim/avatar";
import type { RankedPlayerWithChange } from "./standings";

// Distils a ranked board (with movement vs the previous standings) into a "Power
// Rankings" drop: who leads, who climbed, who slipped, who's newly ranked. Pure
// data shaping — feeds both the LLM column (grounding facts) and the shareable
// card. Movement comes from RankedPlayerWithChange.rankDelta (positive = climbed).

export interface Mover {
  id: string;
  name: string;
  rank: number;
  delta: number | null;
  rating: number;
  record: string; // "W–L"
}

export interface PowerRankings {
  leaders: Mover[]; // current top of the table
  climbers: Mover[]; // biggest upward moves (excludes newly ranked)
  fallers: Mover[]; // biggest downward moves
  newcomers: Mover[]; // freshly ranked since the last standings
}

const MAX_LEADERS = 3;
const MAX_CLIMBERS = 4;
const MAX_FALLERS = 3;
const MAX_NEWCOMERS = 3;

function toMover(p: RankedPlayerWithChange): Mover {
  return {
    id: p.row.player_id,
    name: p.row.name,
    rank: p.rank as number,
    delta: p.rankDelta,
    rating: p.rating,
    record: `${p.row.wins}–${p.row.losses}`,
  };
}

export function buildPowerRankings(board: RankedPlayerWithChange[]): PowerRankings {
  const ranked = board.filter((p) => p.rank !== null);

  const leaders = [...ranked].sort((a, b) => (a.rank as number) - (b.rank as number)).slice(0, MAX_LEADERS).map(toMover);

  const climbers = ranked
    .filter((p) => !p.isNew && p.rankDelta !== null && p.rankDelta > 0)
    .sort((a, b) => (b.rankDelta as number) - (a.rankDelta as number))
    .slice(0, MAX_CLIMBERS)
    .map(toMover);

  const fallers = ranked
    .filter((p) => p.rankDelta !== null && p.rankDelta < 0)
    .sort((a, b) => (a.rankDelta as number) - (b.rankDelta as number))
    .slice(0, MAX_FALLERS)
    .map(toMover);

  const newcomers = ranked
    .filter((p) => p.isNew)
    .sort((a, b) => (a.rank as number) - (b.rank as number))
    .slice(0, MAX_NEWCOMERS)
    .map(toMover);

  return { leaders, climbers, fallers, newcomers };
}

// True when there's anything worth publishing (at least one leader).
export function hasPowerRankings(pr: PowerRankings): boolean {
  return pr.leaders.length > 0;
}

// Grounding fact sheet for the LLM column — names, ranks, moves, ratings only.
export function buildPowerFacts(scope: string, pr: PowerRankings): string {
  const line = (m: Mover, withDelta = false) => {
    const move = withDelta && m.delta != null ? ` (${m.delta > 0 ? "up" : "down"} ${Math.abs(m.delta)})` : "";
    return `#${m.rank} ${m.name} — rating ${m.rating.toFixed(1)}, ${m.record}${move}`;
  };
  const section = (label: string, ms: Mover[], withDelta = false) =>
    ms.length ? `${label}:\n${ms.map((m) => `- ${line(m, withDelta)}`).join("\n")}` : null;

  return [
    `Scope: ${scope}`,
    section("Top of the table", pr.leaders),
    section("Biggest climbers", pr.climbers, true),
    section("Biggest fallers", pr.fallers, true),
    section("Newly ranked", pr.newcomers),
  ]
    .filter(Boolean)
    .join("\n\n");
}

export interface PowerCardInput {
  scopeLabel: string; // e.g. "Expose Padel" or "All clubs"
  headline?: string | null; // optional LLM headline
}

export function buildPowerRankingsCard(
  pr: PowerRankings,
  input: PowerCardInput,
  media?: Map<string, PlayerCardMedia>
): CardSpec {
  const rows: CardSpec["rows"] = [];

  // The player's face (Reclub photo over the sprite) + racket, drawn in the row
  // gutter and by the rank — see lib/share/card.ts. The sprite is always built so
  // a player with no photo still gets a face.
  const face = (m: Mover) => {
    const md = media?.get(m.id);
    return {
      avatar: avatarFromName(m.name, undefined, md?.gender ?? null),
      photoUrl: md?.photoUrl ?? null,
      racketUrl: md?.racketImage ?? null,
    };
  };

  // The card mirrors the on-page sections, each group led by its category heading.
  pr.leaders.forEach((m, i) => {
    rows.push({
      ...face(m),
      heading: i === 0 ? "👑 Top of the table" : undefined,
      title: m.name,
      subtitle: `rating ${m.rating.toFixed(1)} · ${m.record}`,
      value: `#${m.rank}`,
      accent: i === 0,
    });
  });
  pr.climbers.forEach((m, i) => {
    rows.push({
      ...face(m),
      heading: i === 0 ? "▲ Biggest climbers" : undefined,
      title: m.name,
      subtitle: `up ${m.delta} · now #${m.rank}`,
      value: `#${m.rank}`,
      accent: true,
    });
  });
  pr.fallers.forEach((m, i) => {
    rows.push({
      ...face(m),
      heading: i === 0 ? "▼ Biggest fallers" : undefined,
      title: m.name,
      subtitle: `down ${Math.abs(m.delta as number)} · now #${m.rank}`,
      value: `#${m.rank}`,
      valueColor: BRAND.coral,
    });
  });
  pr.newcomers.forEach((m, i) => {
    rows.push({
      ...face(m),
      heading: i === 0 ? "✦ Newly ranked" : undefined,
      title: m.name,
      subtitle: `rating ${m.rating.toFixed(1)} · ${m.record}`,
      value: `#${m.rank}`,
    });
  });

  return {
    kicker: "Power Rankings",
    title: input.scopeLabel,
    headline: input.headline || "Movement since the last Match Night",
    rows,
    // Instagram Stories format: 1080 wide × a 1920 floor → a 9:16 portrait, with
    // the body pinned to the top rather than centered in the slack.
    minHeight: 1920,
    bodyAlign: "top",
  };
}

export function buildPowerCaption(pr: PowerRankings, input: PowerCardInput, column?: string | null): string {
  const lines = [`📊 Power Rankings — ${input.scopeLabel}`];
  if (input.headline) lines.push(input.headline);
  lines.push("");
  if (column) {
    lines.push(column, "");
  }
  if (pr.leaders[0]) lines.push(`👑 #1 ${pr.leaders[0].name} (${pr.leaders[0].rating.toFixed(1)})`);
  for (const m of pr.climbers) lines.push(`▲ ${m.name} up ${m.delta} to #${m.rank}`);
  for (const m of pr.newcomers) lines.push(`✦ ${m.name} debuts at #${m.rank}`);
  lines.push("", "expose.padel-leaderboard");
  return lines.join("\n");
}
