import Link from "next/link";
import { h2hHook } from "@/lib/gossip";
import { getLeaderboard, type RankedPlayer } from "@/lib/leaderboard";
import { levelForRating } from "@/lib/levels";
import { getPlayerMatchHistory } from "@/lib/queries";
import { computeForm, headToHead, opponentRecords, type PairRecord } from "@/lib/relationships";
import { pct, predictMatchup } from "@/lib/versus";
import CompareRadar from "./CompareRadar";
import FormStrip from "@/app/players/[id]/FormStrip";
import { GossipLine, RESULT_TEXT, recordLabel, winPct } from "@/app/players/[id]/relationship-ui";

export const dynamic = "force-dynamic";

export default async function VersusPage({
  searchParams,
}: {
  searchParams: Promise<{ a?: string; b?: string }>;
}) {
  const { a: aId, b: bId } = await searchParams;
  const board = await getLeaderboard();
  const playerA = aId ? board.find((p) => p.row.player_id === aId) ?? null : null;
  const playerB = bId ? board.find((p) => p.row.player_id === bId) ?? null : null;
  const ready = playerA && playerB && playerA.row.player_id !== playerB.row.player_id;

  return (
    <div>
      {/* Header */}
      <section className="mb-8">
        <p className="mono-label mb-4">Versus</p>
        <h1 className="font-display text-[64px] leading-[0.95] tracking-tightest max-w-3xl">
          Settle it. Pick two, see the tape.
        </h1>
        <p className="text-body-muted text-xs mt-5 max-w-xl">
          A grounded tale of the tape: ratings, form, head-to-head, and a win prediction that
          blends the rating gap with whatever the two have actually done to each other on court.
        </p>
      </section>

      <Picker board={board} aId={playerA?.row.player_id} bId={playerB?.row.player_id} />

      {ready ? (
        <Tape playerA={playerA} playerB={playerB} />
      ) : board.length < 2 ? (
        <p className="text-body-muted mt-10 text-sm">
          Need at least two players with recorded games. Upload a scoresheet to get started.
        </p>
      ) : (
        <p className="text-body-muted mt-10 text-sm">
          Choose two different players above and hit Compare.
        </p>
      )}
    </div>
  );
}

// Server-rendered GET form — no client JS. Two native selects keep their current
// pick, and "Compare" navigates to /versus?a=…&b=….
function Picker({
  board,
  aId,
  bId,
}: {
  board: RankedPlayer[];
  aId?: string;
  bId?: string;
}) {
  const players = [...board].sort((p, q) => p.row.name.localeCompare(q.row.name));
  return (
    <form method="get" action="/versus" className="flex flex-wrap items-end gap-3 border-y border-hairline py-5">
      <PlayerSelect name="a" label="Player" players={players} selected={aId} />
      <span className="font-display text-2xl text-muted pb-1">vs</span>
      <PlayerSelect name="b" label="Opponent" players={players} selected={bId} />
      <button type="submit" className="btn-primary">
        Compare
      </button>
    </form>
  );
}

function PlayerSelect({
  name,
  label,
  players,
  selected,
}: {
  name: string;
  label: string;
  players: RankedPlayer[];
  selected?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="mono-label">{label}</span>
      <select
        name={name}
        defaultValue={selected ?? ""}
        className="min-w-[12rem] rounded-sm border border-hairline bg-canvas px-3 py-2 text-sm text-ink"
      >
        <option value="" disabled>
          Select…
        </option>
        {players.map((p) => (
          <option key={p.row.player_id} value={p.row.player_id}>
            {p.row.name} · {p.rating.toFixed(1)}
          </option>
        ))}
      </select>
    </label>
  );
}

async function Tape({ playerA, playerB }: { playerA: RankedPlayer; playerB: RankedPlayer }) {
  const aId = playerA.row.player_id;
  const bId = playerB.row.player_id;
  const [matchesA, matchesB] = await Promise.all([
    getPlayerMatchHistory(aId),
    getPlayerMatchHistory(bId),
  ]);

  const formA = computeForm(matchesA);
  const formB = computeForm(matchesB);
  const { record, games } = headToHead(matchesA, bId); // A's perspective
  const prediction = predictMatchup(playerA.rating, playerB.rating, {
    wins: record.wins,
    games: record.games,
  });
  const common = commonOpponents(matchesA, matchesB, aId, bId);

  return (
    <div className="mt-12">
      {/* Two-up header */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-4 sm:gap-8">
        <Corner player={playerA} form={formA} align="left" />
        <div className="font-display text-3xl text-muted pt-10">⚔️</div>
        <Corner player={playerB} form={formB} align="right" />
      </div>

      {/* Prediction bar */}
      <div className="mt-12">
        <div className="flex items-baseline justify-between mono-label mb-2">
          <span>Predicted edge</span>
          <span className="text-muted normal-case tracking-normal">
            {prediction.basis === "rating+h2h"
              ? "rating gap + head-to-head"
              : "rating gap"}
          </span>
        </div>
        <div className="flex h-10 w-full overflow-hidden rounded-sm border border-hairline">
          <div
            className="flex items-center justify-start bg-deep-green px-3 text-xs font-medium text-white"
            style={{ width: `${pct(prediction.probA)}%` }}
          >
            {pct(prediction.probA) >= 18 ? `${pct(prediction.probA)}%` : ""}
          </div>
          <div
            className="flex items-center justify-end bg-coral px-3 text-xs font-medium text-white"
            style={{ width: `${pct(prediction.probB)}%` }}
          >
            {pct(prediction.probB) >= 18 ? `${pct(prediction.probB)}%` : ""}
          </div>
        </div>
        <div className="flex justify-between text-sm text-body-muted mt-2">
          <span>
            <span className="text-deep-green font-medium">{playerA.row.name}</span> {pct(prediction.probA)}%
          </span>
          <span>
            {pct(prediction.probB)}% <span className="text-coral font-medium">{playerB.row.name}</span>
          </span>
        </div>
        {(playerA.provisional || playerB.provisional) && (
          <p className="text-muted text-xs mt-2">
            One or both are provisional (under 3 games) — treat the prediction as a rough guess.
          </p>
        )}
      </div>

      {/* Attribute overlay */}
      <section className="mt-14">
        <p className="mono-label mb-3">Attribute overlay</p>
        <div className="card p-6">
          <CompareRadar
            nameA={playerA.row.name}
            attrA={playerA.attributes}
            nameB={playerB.row.name}
            attrB={playerB.attributes}
          />
        </div>
      </section>

      {/* Head-to-head */}
      <section className="mt-14">
        <p className="mono-label mb-3">Head to head</p>
        {games.length > 0 ? (
          <>
            <div className="max-w-xl mb-5">
              <GossipLine>{h2hHook(playerA.row.name, playerB.row.name, record)}</GossipLine>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
              <StatLine label={`${playerA.row.name} record`} value={recordLabel(record)} />
              <StatLine label="Meetings" value={String(record.games)} />
              <StatLine label={`${playerA.row.name} win rate`} value={winPct(record)} />
              <StatLine
                label="Point diff"
                value={`${record.pointDiff >= 0 ? "+" : ""}${record.pointDiff}`}
              />
            </div>
            <SharedGames games={games} playerName={playerA.row.name} />
          </>
        ) : (
          <p className="text-body-muted text-sm">
            🆕 {playerA.row.name} and {playerB.row.name} have never met. The prediction above is
            pure rating gap — someone needs to book a court.
          </p>
        )}
      </section>

      {/* Common opponents */}
      {common.length > 0 && (
        <section className="mt-14">
          <p className="mono-label mb-3">Common ground · {common.length} shared opponents</p>
          <div className="overflow-x-auto">
            <div className="min-w-[560px]">
              <div className="grid grid-cols-[1fr_8rem_8rem] gap-3 items-center py-2 border-b border-hairline mono-label">
                <span>Opponent</span>
                <span className="text-right">{playerA.row.name}</span>
                <span className="text-right">{playerB.row.name}</span>
              </div>
              {common.map((c) => (
                <div
                  key={c.id}
                  className="grid grid-cols-[1fr_8rem_8rem] gap-3 items-center py-3 border-b border-hairline text-sm"
                >
                  <Link href={`/players/${c.id}`} className="truncate text-ink hover:opacity-70">
                    {c.name}
                  </Link>
                  <CommonCell rec={c.a} better={c.a.winRate > c.b.winRate} />
                  <CommonCell rec={c.b} better={c.b.winRate > c.a.winRate} />
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

// One player's side of the tape: level chip, archetype, big rating, form strip.
function Corner({
  player,
  form,
  align,
}: {
  player: RankedPlayer;
  form: ReturnType<typeof computeForm>;
  align: "left" | "right";
}) {
  const level = levelForRating(player.rating);
  const right = align === "right";
  return (
    <div className={right ? "text-right" : "text-left"}>
      <div className={`flex flex-wrap items-center gap-2 mb-2 ${right ? "justify-end" : ""}`}>
        <span
          className="level-chip"
          style={{ color: level.color, borderColor: `${level.color}55`, backgroundColor: `${level.color}12` }}
        >
          <span aria-hidden>{level.badge}</span>
          {level.category}
        </span>
        {player.provisional ? (
          <span className="mono-label text-coral">Provisional</span>
        ) : (
          <span className="mono-label">Rank #{player.rank}</span>
        )}
      </div>
      <Link
        href={`/players/${player.row.player_id}`}
        className="font-display text-[32px] sm:text-[40px] leading-none tracking-tight hover:opacity-70 block"
      >
        {player.row.name}
      </Link>
      <span className="archetype-chip mt-2 inline-block">{player.archetype.label}</span>
      <div className="font-display text-[56px] leading-none tracking-tightest mt-4 tabular-nums">
        {player.rating.toFixed(1)}
      </div>
      <div className="mono-label mt-1">Rating / 7</div>
      <div className={`mt-5 inline-block ${right ? "text-left" : ""}`}>
        <FormStrip form={form} />
      </div>
    </div>
  );
}

function CommonCell({ rec, better }: { rec: PairRecord; better: boolean }) {
  return (
    <span className={`text-right tabular-nums ${better ? "text-deep-green font-medium" : "text-body-muted"}`}>
      {recordLabel(rec)} · {winPct(rec)}
    </span>
  );
}

function StatLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-t border-hairline pt-3">
      <div className="font-display text-2xl tracking-tight tabular-nums">{value}</div>
      <div className="mono-label mt-1">{label}</div>
    </div>
  );
}

function SharedGames({
  games,
  playerName,
}: {
  games: Awaited<ReturnType<typeof getPlayerMatchHistory>>;
  playerName: string;
}) {
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[640px]">
        <div className="grid grid-cols-[9rem_2.5rem_1fr_4.5rem_2.5rem] gap-3 items-center py-2 border-b border-hairline mono-label">
          <span>Event</span>
          <span>Round</span>
          <span>Players</span>
          <span className="text-right">Score</span>
          <span className="text-right">Result</span>
        </div>
        {games.map((m) => (
          <div
            key={m.matchId}
            className="grid grid-cols-[9rem_2.5rem_1fr_4.5rem_2.5rem] gap-3 items-center py-3 border-b border-hairline text-sm"
          >
            <Link
              href={`/events/${m.eventId}`}
              className="truncate text-ink hover:opacity-70"
              title={m.eventTitle}
            >
              {m.eventTitle}
            </Link>
            <span className="mono-label">R{m.round}</span>
            <span className="text-body-muted truncate">
              <span className="text-ink">
                {playerName}
                {m.partner ? ` & ${m.partner}` : ""}
              </span>
              <span className="text-muted"> vs </span>
              {m.opponents.join(" & ") || "—"}
            </span>
            <span className="font-mono tabular-nums text-right">
              {m.points}–{m.conceded}
            </span>
            <span className={`text-right font-medium ${RESULT_TEXT[m.result]}`}>{m.result}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Opponents both players have faced, with each player's record against them.
// Most-faced (by the two players combined) first.
interface CommonOpponent {
  id: string;
  name: string;
  a: PairRecord;
  b: PairRecord;
}

function commonOpponents(
  matchesA: Awaited<ReturnType<typeof getPlayerMatchHistory>>,
  matchesB: Awaited<ReturnType<typeof getPlayerMatchHistory>>,
  aId: string,
  bId: string
): CommonOpponent[] {
  const aRecs = new Map(opponentRecords(matchesA).map((r) => [r.id, r]));
  const bRecs = new Map(opponentRecords(matchesB).map((r) => [r.id, r]));
  const common: CommonOpponent[] = [];
  for (const [id, a] of aRecs) {
    // Skip the two players themselves — facing each other isn't "common ground".
    if (id === aId || id === bId) continue;
    const b = bRecs.get(id);
    if (b) common.push({ id, name: a.name, a, b });
  }
  return common.sort((x, y) => y.a.games + y.b.games - (x.a.games + x.b.games) || x.name.localeCompare(y.name));
}
