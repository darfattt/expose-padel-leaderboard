"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import PlayerAvatar from "@/app/components/PlayerAvatar";
import MatchSim from "@/app/versus/MatchSim";
import {
  buildTournament,
  type BracketTeam,
  type PlayedMatch,
  ROUND_LABEL,
  type RoundName,
  type TournamentEntry,
} from "@/lib/sim/tournament";
import { TEAM_A_COLOR, TEAM_B_COLOR } from "@/lib/sim/matchup";
import ShareRun from "./ShareRun";
import { buildRunSummary } from "./share";

const GREEN = "#0a6b56";
const CORAL = "#d6502f";

// The interactive tournament: the whole bracket is computed deterministically up
// front (buildTournament), then revealed round by round. At each stage you watch
// *your* match play out on the 2D court; when it settles, the rest of the round
// is unveiled and you advance. The Final is best-of-three.
export default function TournamentArena({
  entries,
  youId,
  seed,
}: {
  entries: TournamentEntry[];
  youId: string;
  seed: number;
}) {
  const router = useRouter();
  const t = useMemo(() => buildTournament(entries, youId, seed), [entries, youId, seed]);

  // How many rounds have been fully revealed (0..3). The round at this index is
  // the one currently being contested; everything past it stays under wraps.
  const [revealed, setRevealed] = useState(0);
  // Which game of your current (best-of-three) match you're watching.
  const [gameIdx, setGameIdx] = useState(0);
  // Your match in the current round has finished its full series.
  const [settled, setSettled] = useState(false);
  // The current game's clock has reached the end (gates the next/advance button).
  const [gameOver, setGameOver] = useState(false);

  const finished = revealed >= t.rounds.length;
  const currentRound = finished ? null : t.rounds[revealed];
  const yourMatch = currentRound?.matches.find((m) => m.isYours) ?? null;

  // The furthest round whose result you've actually seen — a your-match is decided
  // once you've advanced past its round (revealed > i) or it has settled this round.
  // Drives the shareable summary so it never leaks an unrevealed result.
  const throughRoundIndex = finished ? t.rounds.length - 1 : settled ? revealed : revealed - 1;
  const summary = buildRunSummary(t, throughRoundIndex);

  const reroll = () => {
    const next = (Math.floor(Math.random() * 0xffffffff) ^ (seed + 0x9e3779b9)) >>> 0;
    router.push(`/tournament?you=${encodeURIComponent(youId)}&seed=${next}`);
  };
  const restart = () => {
    setRevealed(0);
    setGameIdx(0);
    setSettled(false);
    setGameOver(false);
  };

  // Reveal the rest of the current round and step to the next stage.
  const advance = () => {
    setRevealed((r) => r + 1);
    setGameIdx(0);
    setSettled(false);
    setGameOver(false);
  };

  return (
    <div className="mt-10">
      {/* Stage header */}
      <div className="flex flex-wrap items-end justify-between gap-3 border-y border-hairline py-4">
        <div>
          <p className="mono-label mb-1">Tournament · 8 teams</p>
          <h2 className="font-display text-3xl tracking-tight">
            {finished ? "Champions crowned" : `${ROUND_LABEL[currentRound!.name]}s`}
          </h2>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={restart} className="btn-secondary text-sm">
            ↺ Restart
          </button>
          <button type="button" onClick={reroll} className="btn-secondary text-sm" title="Draw a fresh field & bracket">
            🎲 New draw
          </button>
        </div>
      </div>

      {/* Arena — your match, or the elimination / champion notice */}
      <section className="mt-8">
        {finished ? (
          <ChampionCard champion={t.champion} youWonIt={t.youWonIt} youReached={t.youReached} />
        ) : yourMatch ? (
          <YourMatch
            key={`${currentRound!.name}-${gameIdx}`}
            match={yourMatch}
            gameIdx={gameIdx}
            settled={settled}
            gameOver={gameOver}
            youAvatar={youAvatar(t.teams)}
            oppAvatar={oppAvatarFor(yourMatch)}
            onGameOver={() => setGameOver(true)}
            onNextGame={() => {
              setGameIdx((g) => g + 1);
              setGameOver(false);
            }}
            onSeriesSettled={() => setSettled(true)}
            onAdvance={advance}
            nextLabel={nextStageLabel(t.rounds, revealed)}
          />
        ) : (
          <EliminatedCard
            round={currentRound!.name}
            youReached={t.youReached}
            onReveal={advance}
            nextLabel={nextStageLabel(t.rounds, revealed)}
          />
        )}

        {/* Share your latest result / run to social — appears once a match of
            yours has been decided. */}
        {summary && <ShareRun summary={summary} />}
      </section>

      {/* The bracket — revealed progressively */}
      <section className="mt-12">
        <p className="mono-label mb-4">Bracket</p>
        <Bracket rounds={t.rounds} revealed={revealed} />
      </section>
    </div>
  );
}

// --- your match -------------------------------------------------------------

function YourMatch({
  match,
  gameIdx,
  settled,
  gameOver,
  youAvatar,
  oppAvatar,
  onGameOver,
  onNextGame,
  onSeriesSettled,
  onAdvance,
  nextLabel,
}: {
  match: PlayedMatch;
  gameIdx: number;
  settled: boolean;
  gameOver: boolean;
  youAvatar: string | null;
  oppAvatar: string | null;
  onGameOver: () => void;
  onNextGame: () => void;
  onSeriesSettled: () => void;
  onAdvance: () => void;
  nextLabel: string;
}) {
  const scripts = match.scripts ?? [];
  const script = scripts[gameIdx];
  const bestOf3 = match.bestOf === 3;
  // Series score after the games watched so far (you are side A).
  const watched = scripts.slice(0, gameIdx + 1);
  const youGames = watched.filter((s) => s.winner === "A").length;
  const oppGames = watched.filter((s) => s.winner === "B").length;
  const seriesDecided = youGames === 2 || oppGames === 2 || !bestOf3;
  const youWonMatch = match.result.winner === "A";
  // The title-clinching game: winning *this* game of the final is what crowns you
  // — that's the one that earns the trophy + photographer celebration.
  const finaleWin = bestOf3 && match.round === "F" && script?.winner === "A" && youGames === 2;

  if (!script) return null;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="mono-label">
          {ROUND_LABEL[match.round]} · {match.a.entry.name} vs {match.b.entry.name}
        </p>
        {bestOf3 && (
          <p className="text-sm tabular-nums">
            <span style={{ color: GREEN }}>Best of 3 — Game {gameIdx + 1}</span>{" "}
            <span className="text-muted">
              ({youGames}–{oppGames})
            </span>
          </p>
        )}
      </div>

      <MatchSim
        script={script}
        nameA={match.a.entry.name}
        nameB={match.b.entry.name}
        avatarA={youAvatar}
        avatarB={oppAvatar}
        deathSide={match.result.gearlessSide ?? undefined}
        finale={finaleWin}
        autoPlay={gameIdx > 0}
        collapsibleCommentary
        commentaryDefaultOpen={false}
        onEnded={() => {
          onGameOver();
          if (seriesDecided) onSeriesSettled();
        }}
      />

      {/* After a game ends: continue the series, or advance the bracket */}
      {gameOver && (
        <div className="mt-5 flex flex-wrap items-center gap-3 rounded-sm border border-hairline bg-canvas px-4 py-3">
          {bestOf3 && !seriesDecided ? (
            <>
              <span className="text-sm text-body-muted">
                Game to{" "}
                <span style={{ color: scripts[gameIdx].winner === "A" ? GREEN : CORAL }} className="font-medium">
                  {scripts[gameIdx].winner === "A" ? match.a.entry.name : match.b.entry.name}
                </span>
                . Series {youGames}–{oppGames}.
              </span>
              <button type="button" onClick={onNextGame} className="btn-primary text-sm">
                ▶ Play game {gameIdx + 2}
              </button>
            </>
          ) : (
            settled && (
              <>
                <span className="text-sm font-medium" style={{ color: youWonMatch ? GREEN : CORAL }}>
                  {youWonMatch
                    ? `You win the ${ROUND_LABEL[match.round].toLowerCase()}!`
                    : `Knocked out in the ${ROUND_LABEL[match.round].toLowerCase()}.`}
                </span>
                <button type="button" onClick={onAdvance} className="btn-primary text-sm">
                  {nextLabel}
                </button>
              </>
            )
          )}
        </div>
      )}
    </div>
  );
}

// --- eliminated / champion --------------------------------------------------

function EliminatedCard({
  round,
  youReached,
  onReveal,
  nextLabel,
}: {
  round: RoundName;
  youReached: RoundName;
  onReveal: () => void;
  nextLabel: string;
}) {
  return (
    <div className="card p-6">
      <p className="mono-label mb-2 text-coral">Your run ended in the {ROUND_LABEL[youReached].toLowerCase()}</p>
      <p className="text-body-muted text-sm max-w-xl">
        You&apos;re out, but the bracket plays on. Reveal the {ROUND_LABEL[round].toLowerCase()} to see who
        marches toward the title.
      </p>
      <button type="button" onClick={onReveal} className="btn-primary mt-4 text-sm">
        {nextLabel}
      </button>
    </div>
  );
}

function ChampionCard({
  champion,
  youWonIt,
  youReached,
}: {
  champion: BracketTeam;
  youWonIt: boolean;
  youReached: RoundName;
}) {
  return (
    <div className="card p-8 text-center">
      <p className="mono-label mb-3">{youWonIt ? "🏆 You did it" : "🏆 Champions"}</p>
      <PlayerAvatar name={champion.entry.name} avatarUrl={champion.entry.avatarUrl} size={64} />
      <h3 className="font-display text-4xl tracking-tight mt-4">
        {champion.entry.name} <span className="text-muted">&amp; {champion.pro.name}</span>
      </h3>
      <p className="text-body-muted text-sm mt-3">
        {youWonIt
          ? "Eight teams entered — your pair lifted the trophy."
          : `Your run ended in the ${ROUND_LABEL[youReached].toLowerCase()}. ${champion.entry.name}'s pair took the title.`}
      </p>
    </div>
  );
}

// --- bracket ----------------------------------------------------------------

function Bracket({ rounds, revealed }: { rounds: { name: RoundName; matches: PlayedMatch[] }[]; revealed: number }) {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
      {rounds.map((round, r) => (
        <div key={round.name}>
          <p className="mono-label mb-3 text-muted">{ROUND_LABEL[round.name]}</p>
          <div className="space-y-4">
            {round.matches.map((m) => (
              <MatchCard
                key={`${round.name}-${m.index}`}
                match={m}
                teamsKnown={revealed >= r}
                resultShown={revealed > r}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function MatchCard({
  match,
  teamsKnown,
  resultShown,
}: {
  match: PlayedMatch;
  teamsKnown: boolean;
  resultShown: boolean;
}) {
  if (!teamsKnown) {
    return (
      <div className="rounded-sm border border-dashed border-hairline p-3 text-sm text-muted">
        Awaiting qualifiers…
      </div>
    );
  }
  const aWon = resultShown && match.result.winner === "A";
  const bWon = resultShown && match.result.winner === "B";
  const score =
    match.bestOf === 3
      ? `${match.result.gameWins.a}–${match.result.gameWins.b}`
      : match.result.games[0]
        ? `${match.result.games[0].a}–${match.result.games[0].b}`
        : "";
  return (
    <div className="rounded-sm border border-hairline overflow-hidden">
      <TeamRow
        team={match.a}
        side="A"
        won={aWon}
        dim={resultShown && !aWon}
        score={resultShown ? score : null}
        gearless={match.result.gearlessSide === "A"}
      />
      <div className="h-px bg-hairline" />
      <TeamRow
        team={match.b}
        side="B"
        won={bWon}
        dim={resultShown && !bWon}
        gearless={match.result.gearlessSide === "B"}
      />
      {match.result.gearlessSide && !resultShown && (
        <p className="bg-coral/10 px-3 py-1 text-[11px] text-coral">💀 Gearless team — they won&apos;t survive</p>
      )}
    </div>
  );
}

function TeamRow({
  team,
  side,
  won,
  dim,
  score,
  gearless,
}: {
  team: BracketTeam;
  side: "A" | "B";
  won: boolean;
  dim: boolean;
  score?: string | null;
  gearless?: boolean;
}) {
  const accent = side === "A" ? TEAM_A_COLOR : TEAM_B_COLOR;
  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 ${dim ? "opacity-50" : ""}`}
      style={team.isYou ? { boxShadow: `inset 3px 0 0 ${accent}` } : undefined}
    >
      <PlayerAvatar name={team.entry.name} avatarUrl={team.entry.avatarUrl} size={24} />
      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm ${won ? "font-semibold" : ""}`}>
          {team.isYou ? "You" : team.entry.name}
          {gearless && <span className="ml-1">💀</span>}
        </p>
        <p className="truncate text-[11px] text-muted">&amp; {team.pro.name}</p>
      </div>
      {score != null && <span className="font-mono text-sm tabular-nums">{score}</span>}
      {won && <span className="text-xs">✓</span>}
    </div>
  );
}

// --- helpers ----------------------------------------------------------------

function youAvatar(teams: BracketTeam[]): string | null {
  return teams.find((t) => t.isYou)?.entry.avatarUrl ?? null;
}

function oppAvatarFor(match: PlayedMatch): string | null {
  const opp = match.a.isYou ? match.b : match.a;
  return opp.entry.avatarUrl ?? null;
}

function nextStageLabel(rounds: { name: RoundName }[], revealed: number): string {
  const next = rounds[revealed + 1];
  if (!next) return "Reveal the champion →";
  return `Reveal results · on to the ${ROUND_LABEL[next.name].toLowerCase()} →`;
}
