import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getRankedPlayer, getRatingField } from "@/lib/leaderboard";
import { levelForRating } from "@/lib/levels";
import { getPlayer, getPlayerMatchHistory } from "@/lib/queries";
import { buildRatingHistory } from "@/lib/rating-history";
import AttributeRadar from "./AttributeRadar";
import RatingHistoryChart from "./RatingHistoryChart";
import ReportCardAsync from "./ReportCardAsync";
import ReportCardSkeleton from "./ReportCardSkeleton";

export const dynamic = "force-dynamic";

export default async function PlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const player = await getRankedPlayer(id);

  if (!player) {
    const exists = await getPlayer(id);
    if (!exists) notFound();
    // Player exists but has no games yet.
    return (
      <div>
        <BackLink />
        <h1 className="font-display text-[48px] tracking-tight mt-4">{exists.name}</h1>
        <p className="text-body-muted mt-2">No games recorded yet.</p>
      </div>
    );
  }

  // Only the fast DB read blocks the page. The LLM Player Report streams in
  // separately via the <Suspense> boundary below, so the page renders at once.
  const [matches, ratingField] = await Promise.all([
    getPlayerMatchHistory(id),
    getRatingField(),
  ]);
  const r = player.row;
  const a = player.attributes;
  const level = levelForRating(player.rating);
  const ratingHistory = buildRatingHistory(matches, ratingField, { id: r.player_id, name: r.name });

  return (
    <div>
      <BackLink />

      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4 mt-4 mb-10">
        <div>
          <div className="flex flex-wrap items-center gap-3 mb-2">
            <span
              className="level-chip"
              style={{
                color: level.color,
                borderColor: `${level.color}55`,
                backgroundColor: `${level.color}12`,
              }}
            >
              <span aria-hidden>{level.badge}</span>
              {level.category}
            </span>
            <span className="archetype-chip">{player.archetype.label}</span>
            {player.provisional ? (
              <span className="mono-label text-coral">Provisional</span>
            ) : (
              <span className="mono-label">Rank #{player.rank}</span>
            )}
          </div>
          <h1 className="font-display text-[56px] leading-none tracking-tight">{r.name}</h1>
          <p className="text-body-muted mt-2 max-w-md">{player.archetype.description}</p>
          <p className="text-body-muted mt-1 max-w-md text-sm">
            {level.badge} {level.category} · {level.description}
          </p>
        </div>
        <div className="text-right">
          <div className="font-display text-[64px] leading-none tracking-tightest">
            {player.rating.toFixed(1)}
          </div>
          <div className="mono-label mt-1">Rating / 10</div>
        </div>
      </div>

      {/* Radar + report */}
      <div className="grid md:grid-cols-2 gap-6 mb-10">
        <div className="card p-6">
          <p className="mono-label mb-2">Attributes</p>
          <AttributeRadar attributes={a} />
          <div className="grid grid-cols-4 gap-2 mt-2 text-center">
            {[
              ["PWR", a.attack],
              ["WIN", a.win],
              ["CLT", a.clutch],
              ["CON", a.consistency],
            ].map(([label, v]) => (
              <div key={label as string}>
                <div className="font-mono text-lg tabular-nums">{v}</div>
                <div className="mono-label">{label}</div>
              </div>
            ))}
          </div>
        </div>
        <Suspense fallback={<ReportCardSkeleton />}>
          <ReportCardAsync playerId={id} />
        </Suspense>
      </div>

      {/* Stat lines */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-12">
        <StatLine label="Record" value={`${r.wins}–${r.losses}${r.draws ? `–${r.draws}` : ""}`} />
        <StatLine label="Games" value={String(r.games)} />
        <StatLine
          label="Point diff"
          value={`${r.point_diff >= 0 ? "+" : ""}${r.point_diff}`}
        />
        <StatLine label="Close games" value={`${r.close_wins}/${r.close_games}`} />
        <StatLine label="Points for" value={String(r.points_for)} />
        <StatLine label="Points against" value={String(r.points_against)} />
        <StatLine label="Win rate" value={`${Math.round(player.metrics.winRate * 100)}%`} />
        <StatLine label="Pts / game" value={player.metrics.ppg.toFixed(1)} />
      </div>

      {/* Rating history */}
      {ratingHistory.length >= 2 ? (
        <div className="card p-6 mb-12">
          <p className="mono-label mb-1">Rating history</p>
          <p className="text-body-muted text-sm mb-4">
            Rating after each event · {ratingHistory.length} events
          </p>
          <RatingHistoryChart history={ratingHistory} />
        </div>
      ) : null}

      {/* Match history */}
      <section>
        <p className="mono-label mb-3">Match history · {matches.length} games</p>
        {matches.length === 0 ? (
          <p className="text-body-muted py-6 border-t border-hairline">No matches recorded.</p>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[680px]">
              {/* Header */}
              <div className="grid grid-cols-[9rem_7rem_2.5rem_1fr_4.5rem_2.5rem] gap-3 items-center py-2 border-b border-hairline mono-label">
                <span>Event</span>
                <span>Location</span>
                <span>Round</span>
                <span>Players</span>
                <span className="text-right">Score</span>
                <span className="text-right">Result</span>
              </div>
              {matches.map((m) => (
                <div
                  key={m.matchId}
                  className="grid grid-cols-[9rem_7rem_2.5rem_1fr_4.5rem_2.5rem] gap-3 items-center py-3 border-b border-hairline text-sm"
                >
                  <Link
                    href={`/events/${m.eventId}`}
                    className="truncate text-ink hover:opacity-70"
                    title={m.eventTitle}
                  >
                    {m.eventTitle}
                  </Link>
                  <span className="truncate text-body-muted" title={m.location ?? ""}>
                    {m.location ?? "—"}
                  </span>
                  <span className="mono-label">R{m.round}</span>
                  <span className="text-body-muted truncate">
                    <span className="text-ink">
                      {r.name}
                      {m.partner ? ` & ${m.partner}` : ""}
                    </span>
                    <span className="text-muted"> vs </span>
                    {m.opponents.join(" & ") || "—"}
                  </span>
                  <span className="font-mono tabular-nums text-right">
                    {m.points}–{m.conceded}
                  </span>
                  <span
                    className={`text-right font-medium ${
                      m.result === "W" ? "text-deep-green" : m.result === "L" ? "text-muted" : "text-slate"
                    }`}
                  >
                    {m.result}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function BackLink() {
  return (
    <Link href="/" className="btn-secondary text-sm">
      ← Leaderboard
    </Link>
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
