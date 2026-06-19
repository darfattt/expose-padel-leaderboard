import Link from "next/link";
import { getRacketRating } from "@/app/actions/player";
import PlayerAvatar from "@/app/components/PlayerAvatar";
import { type Achievement, type AchievementContext, computeAchievements } from "@/lib/achievements";
import { h2hHook } from "@/lib/gossip";
import { getLeaderboard, type RankedPlayer } from "@/lib/leaderboard";
import { levelForRating } from "@/lib/levels";
import {
  getPlayerGear,
  getPlayerMatchHistory,
  getPlayerReclub,
  type MatchHistoryEntry,
} from "@/lib/queries";
import { avatarFor } from "@/lib/reclub-avatar";
import { computeForm, headToHead, opponentRecords, type PairRecord } from "@/lib/relationships";
import { scriptForMatchup } from "@/lib/sim/matchup";
import type { PlayerGear } from "@/lib/types";
import { pct, predictMatchup } from "@/lib/versus";
import CompareRadar from "./CompareRadar";
import MatchSim from "./MatchSim";
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

  // Anyone can be put on the tale of the tape — ratings, form and head-to-head
  // need no gear. The match simulation alone is gated (on gear) inside <Tape>.
  const playerA = aId ? board.find((p) => p.row.player_id === aId) ?? null : null;
  const playerB = bId ? board.find((p) => p.row.player_id === bId) ?? null : null;
  const ready =
    playerA &&
    playerB &&
    playerA.row.player_id !== playerB.row.player_id;

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
        <Tape playerA={playerA} playerB={playerB} board={board} />
      ) : board.length < 2 ? (
        <p className="text-body-muted mt-10 text-sm">
          Need at least two players to compare.
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

async function Tape({
  playerA,
  playerB,
  board,
}: {
  playerA: RankedPlayer;
  playerB: RankedPlayer;
  board: RankedPlayer[];
}) {
  const aId = playerA.row.player_id;
  const bId = playerB.row.player_id;
  const [matchesA, matchesB, gearA, gearB, reclubA, reclubB] = await Promise.all([
    getPlayerMatchHistory(aId),
    getPlayerMatchHistory(bId),
    getPlayerGear(aId),
    getPlayerGear(bId),
    getPlayerReclub(aId),
    getPlayerReclub(bId),
  ]);
  // Resolve each player's real Reclub photo (stored, else scraped from their
  // profile) so the sim shows actual faces, not just generated sprites — and the
  // catalogue review score of each racket, so a stronger frame tilts the sim
  // (higher gear, more power). Both are cached daily; missing → null (neutral).
  const [avatarA, avatarB, gearRatingA, gearRatingB] = await Promise.all([
    avatarFor(reclubA.url, reclubA.avatarUrl),
    avatarFor(reclubB.url, reclubB.avatarUrl),
    gearA.racketSlug ? getRacketRating(gearA.racketSlug) : Promise.resolve(null),
    gearB.racketSlug ? getRacketRating(gearB.racketSlug) : Promise.resolve(null),
  ]);

  const formA = computeForm(matchesA);
  const formB = computeForm(matchesB);
  const { record, games } = headToHead(matchesA, bId); // A's perspective
  const prediction = predictMatchup(playerA.rating, playerB.rating, {
    wins: record.wins,
    games: record.games,
  });
  const common = commonOpponents(matchesA, matchesB, aId, bId);

  // The simulated match leans on real gear, so it's the one thing gated: both
  // players must have a racket set up. The rest of the tape works for anyone.
  const canSimulate = Boolean(gearA.racketName) && Boolean(gearB.racketName);
  const needsGear = [
    !gearA.racketName ? playerA.row.name : null,
    !gearB.racketName ? playerB.row.name : null,
  ].filter((n): n is string => n != null);

  // Field context shared by the morale (badge) signal below: who's top-3, and
  // every player's rating, so the achievement engine can judge upsets/rank.
  const rankedCount = board.filter((p) => p.rank != null).length;
  const ratingById = new Map(board.map((p) => [p.row.player_id, p.rating]));
  const topRankIds = new Set(
    board.filter((p) => p.rank != null && p.rank <= 3).map((p) => p.row.player_id)
  );

  // Pixel-art match cartoon. The edge (who's favoured, and the bar's own
  // prediction) is built server-side from the full picture — rating + h2h, then
  // attributes, gear, ladder rank, experience, form and earned badges — so all of
  // those move the sim, not just the rating gap. Replayed by the client <MatchSim>.
  const script = scriptForMatchup({
    a: simPlayer(playerA, formWinRate(formA), gearA, gearRatingA, matchesA, { ratingById, topRankIds, rankedCount }, !!reclubA.url),
    b: simPlayer(playerB, formWinRate(formB), gearB, gearRatingB, matchesB, { ratingById, topRankIds, rankedCount }, !!reclubB.url),
    aId,
    bId,
    ratingA: playerA.rating,
    ratingB: playerB.rating,
    target: prediction.probA,
  });

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

      {/* 2D match simulation — the arcade replay of the full-picture edge. The
          court always shows so the feature is visible; playback is gated on gear
          (a player without a racket can't step on court). */}
      <section className="mt-14">
        <MatchSim
          script={script}
          nameA={playerA.row.name}
          nameB={playerB.row.name}
          avatarA={avatarA}
          avatarB={avatarB}
          locked={!canSimulate}
          lockedNotice={
            <>
              <p className="mono-label mb-1 text-coral">Match simulation locked</p>
              <p className="text-body-muted text-sm">
                {needsGear.join(" and ")} can&apos;t play a simulated match yet. Please set up their
                gear first — pick a racket on the{" "}
                {needsGear.length > 1 ? (
                  "player pages"
                ) : (
                  <Link
                    href={`/players/${!gearA.racketName ? aId : bId}`}
                    className="text-ink underline hover:opacity-70"
                  >
                    player page
                  </Link>
                )}{" "}
                to unlock the match.
              </p>
            </>
          }
        />
        {canSimulate && script.edge && (
          <EdgeBreakdown
            edge={script.edge}
            nameA={playerA.row.name}
            nameB={playerB.row.name}
          />
        )}
        {canSimulate && (
          <p className="text-muted text-xs mt-3">
            The replay weighs more than rating: attributes, gear, ladder rank, experience, recent
            form and earned badges all tilt the court. Momentum, clutch on the big points and stamina
            late then shape how each rally plays out — so every <span className="font-medium">Rematch</span>{" "}
            tells a different story while the odds stay honest.
          </p>
        )}
      </section>

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

// What tilts the court beyond the rating gap. Lists each grounded factor
// (attributes, gear, ladder, experience, form, badges) and the percentage points
// it added to — or took from — team A's simulated win chance. Green favours A,
// coral favours B; the headline shows the start (rating + h2h) and the end.
function EdgeBreakdown({
  edge,
  nameA,
  nameB,
}: {
  edge: NonNullable<ReturnType<typeof scriptForMatchup>["edge"]>;
  nameA: string;
  nameB: string;
}) {
  const movers = edge.factors.filter((f) => Math.abs(f.delta) >= 0.1);
  return (
    <div className="mt-4 card p-5">
      <div className="flex items-baseline justify-between mb-3">
        <p className="mono-label">What tilts the court</p>
        <span className="text-muted text-xs tabular-nums">
          rating {pct(edge.baseTarget)}% → sim {pct(edge.target)}%{" "}
          <span className="text-deep-green">{nameA}</span>
        </span>
      </div>
      {movers.length === 0 ? (
        <p className="text-body-muted text-sm">
          Dead level beyond the rating — nothing in the gear, ladder, mileage, form or badges
          separates {nameA} and {nameB}.
        </p>
      ) : (
        <ul className="space-y-2">
          {movers.map((f) => {
            const favoursA = f.delta >= 0;
            return (
              <li key={f.key} className="grid grid-cols-[5.5rem_1fr_3.5rem] items-center gap-3 text-sm">
                <span className="mono-label">{f.label}</span>
                <span className="text-body-muted truncate">{f.detail}</span>
                <span
                  className="text-right font-medium tabular-nums"
                  style={{ color: favoursA ? "#0a6b56" : "#d6502f" }}
                >
                  {favoursA ? "+" : ""}
                  {f.delta.toFixed(1)}%
                </span>
              </li>
            );
          })}
        </ul>
      )}
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

// Recent win rate from the form strip (wins / games shown), 0.5 when there's no
// recent history to read — the neutral value the edge model expects.
function formWinRate(form: ReturnType<typeof computeForm>): number {
  if (!form.recent.length) return 0.5;
  const wins = form.recent.filter((r) => r === "W").length;
  return wins / form.recent.length;
}

// A signed "morale" from the player's badge wall: earned good badges minus earned
// shame badges. Built from the same computeAchievements the profile uses, with a
// light field context (rank, ratings, top-3, gear) so the field-relative badges
// can fire. A decorated player carries confidence into the cartoon; a pile of
// shame drags. Field-heavy badges that need full results simply stay unearned.
function badgeMorale(
  player: RankedPlayer,
  matches: MatchHistoryEntry[],
  gear: PlayerGear,
  field: { ratingById: Map<string, number>; topRankIds: Set<string>; rankedCount: number },
  reclubLinked: boolean
): number {
  const ctx: AchievementContext = {
    rank: player.rank,
    topRankIds: field.topRankIds,
    ratingById: field.ratingById,
    selfRating: player.rating,
    selfId: player.row.player_id,
    consistency: player.attributes.consistency,
    gear,
    reclubLinked,
  };
  const earned: Achievement[] = computeAchievements(player.row, matches, ctx).filter((a) => a.earned);
  const good = earned.filter((a) => a.tone === "good").length;
  const bad = earned.filter((a) => a.tone === "bad").length;
  return good - bad;
}

// Assemble the grounded TeamPlayer the sim consumes: identity + attributes, plus
// the rich signals (ladder rank, career mileage, recent form, badge morale, gear)
// that tilt the simulated edge beyond the rating gap.
function simPlayer(
  player: RankedPlayer,
  form: number,
  gear: PlayerGear,
  gearRating: number | null,
  matches: MatchHistoryEntry[],
  field: { ratingById: Map<string, number>; topRankIds: Set<string>; rankedCount: number },
  reclubLinked: boolean
) {
  return {
    name: player.row.name,
    rating: player.rating,
    attributes: player.attributes,
    archetypePrimary: player.archetype.primary,
    hasRacket: Boolean(gear.racketName),
    racketName: gear.racketName,
    racketBrand: gear.racketBrand,
    gearRating,
    rank: player.rank,
    fieldSize: field.rankedCount,
    experienceGames: player.row.games,
    form,
    morale: badgeMorale(player, matches, gear, field, reclubLinked),
    gender: gear.gender, // women's player → women's pro partner + a female sprite
  };
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
