import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { computeAchievements } from "@/lib/achievements";
import { ppgTrend, ratingHistogram } from "@/lib/distribution";
import { fetchRawResults, getLeaderboard, getRatingField } from "@/lib/leaderboard";
import { levelForRating } from "@/lib/levels";
import { getPlayer, getPlayerGear, getPlayerMatchHistory, getPlayerRackets, getPlayerReclub } from "@/lib/queries";
import { buildRatingHistory } from "@/lib/rating-history";
import { avatarFor } from "@/lib/reclub-avatar";
import { racketPlayStyle } from "@/lib/racket-reco";
import { nextReliabilityGate, reliabilityCap } from "@/lib/rating";
import { venueHook } from "@/lib/gossip";
import { bestVenue, computeForm, partnerChemistry, rivalries } from "@/lib/relationships";
import AchievementsCard from "./AchievementsCard";
import AttributeRadar from "./AttributeRadar";
import FormStrip from "./FormStrip";
import GearCard from "./GearCard";
import GenderCard from "./GenderCard";
import PlayerAvatar from "@/app/components/PlayerAvatar";
import ReclubCard from "./ReclubCard";
import RatingHistogram from "@/app/trends/RatingHistogram";
import GossipCardAsync from "./GossipCardAsync";
import GossipCardSkeleton from "./GossipCardSkeleton";
import { GossipLine } from "./relationship-ui";
import PartnerChemistryCard from "./PartnerChemistryCard";
import PpgSparkline from "./PpgSparkline";
import RacketRecoAsync, { RacketRecoSkeleton } from "./RacketReco";
import RatingHistoryChart from "./RatingHistoryChart";
import ReportCardAsync from "./ReportCardAsync";
import ReportCardSkeleton from "./ReportCardSkeleton";
import RivalriesCard from "./RivalriesCard";

export const dynamic = "force-dynamic";

export default async function PlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // One leaderboard build gives both this player's enriched entry and the field
  // context (ratings + current top 3) the achievements need.
  const board = await getLeaderboard();
  const player = board.find((p) => p.row.player_id === id) ?? null;

  if (!player) {
    const exists = await getPlayer(id);
    if (!exists) notFound();
    // Player exists but has no games yet — gear/position/profile still editable.
    const [gear, reclub] = await Promise.all([getPlayerGear(id), getPlayerReclub(id)]);
    // Resolve the avatar live (stored value, or read off the profile page) so a
    // seeded link with no cached avatar still shows a face.
    const reclubResolved = { ...reclub, avatarUrl: await avatarFor(reclub.url, reclub.avatarUrl) };
    return (
      <div>
        <BackLink />
        <div className="flex items-center gap-4 mt-4">
          <PlayerAvatar name={exists.name} avatarUrl={reclubResolved.avatarUrl} size={64} />
          <h1 className="font-display text-[48px] tracking-tight">{exists.name}</h1>
        </div>
        <p className="text-body-muted mt-2 mb-8">No games recorded yet.</p>
        <div className="flex flex-wrap items-end gap-x-8 gap-y-6">
          <ReclubCard playerId={id} initial={reclubResolved} />
          <GearCard playerId={id} initial={gear} />
          <GenderCard playerId={id} initial={gear.gender} />
        </div>
      </div>
    );
  }

  // Only the fast DB read blocks the page. The LLM Player Report streams in
  // separately via the <Suspense> boundary below, so the page renders at once.
  const [matches, ratingField, results, gear, fieldRacketMap, reclub] = await Promise.all([
    getPlayerMatchHistory(id),
    getRatingField(),
    fetchRawResults(),
    getPlayerGear(id),
    getPlayerRackets(),
    getPlayerReclub(id),
  ]);
  // Resolve the avatar live (stored value, or read off the profile page) so a
  // seeded link with no cached avatar still shows a face.
  const reclubResolved = { ...reclub, avatarUrl: await avatarFor(reclub.url, reclub.avatarUrl) };
  const fieldRackets = [...fieldRacketMap].map(([playerId, rk]) => ({
    playerId,
    brand: rk.brand,
    name: rk.name,
    slug: rk.slug,
  }));
  const r = player.row;
  const a = player.attributes;
  const level = levelForRating(player.rating);
  const ratingHistory = buildRatingHistory(matches, ratingField, { id: r.player_id, name: r.name });
  const ppg = ppgTrend(matches);
  const fieldBins = ratingHistogram(board.filter((p) => p.row.games > 0).map((p) => p.rating));
  const form = computeForm(matches);
  const chemistry = partnerChemistry(matches);
  const rivalry = rivalries(matches);
  const venueGossip = venueHook(bestVenue(matches));
  const achievements = computeAchievements(r, matches, {
    rank: player.rank,
    topRankIds: new Set(board.filter((p) => p.rank !== null && p.rank <= 3).map((p) => p.row.player_id)),
    ratingById: new Map(board.map((p) => [p.row.player_id, p.rating])),
    selfRating: player.rating,
    ratingHistory: ratingHistory.map((h) => h.rating),
    selfId: r.player_id,
    results,
    consistency: player.attributes.consistency,
    gear,
    reclubLinked: !!reclub.url,
    fieldRackets,
    playStyle: racketPlayStyle(player.attributes),
  });

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
          <div className="flex items-center gap-4">
            <PlayerAvatar name={r.name} avatarUrl={reclubResolved.avatarUrl} size={72} />
            <h1 className="font-display text-[56px] leading-none tracking-tight">{r.name}</h1>
          </div>
          <p className="text-body-muted mt-2 max-w-md">{player.archetype.description}</p>
          <p className="text-body-muted mt-1 max-w-md text-sm">
            {level.badge} {level.category} · {level.description}
          </p>
        </div>
        {/* Profile + gear hero + rating share the right side; wrap on mobile */}
        <div className="flex flex-wrap items-end gap-x-8 gap-y-6">
          <ReclubCard playerId={id} initial={reclubResolved} />
          <GearCard playerId={id} initial={gear} />
          <GenderCard playerId={id} initial={gear.gender} />
          <div className="text-right">
            <div className="font-display text-[64px] leading-none tracking-tightest">
              {player.rating.toFixed(1)}
            </div>
            <div className="mono-label mt-1">Rating / 7</div>
            {player.ratingPenalty > 0 ? (
              <div
                className="mono-label mt-1 text-coral"
                title={`Skill rating ${player.baseRating.toFixed(1)}, docked ${player.ratingPenalty.toFixed(1)} for ${player.daysInactive ?? "?"} days off the court. Play to knock the rust off.`}
              >
                💤 −{player.ratingPenalty.toFixed(1)} rust
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Reliability gate: shown only while it actively caps the *skill* rating
          (the pre-rust base), so inactivity rust never masks an earned gate. */}
      <ReliabilityGate score={r.norm_point_diff ?? r.point_diff} wins={r.wins} rating={player.baseRating} />

      {/* Recent form + gossip hooks (deterministic one-liner + LLM column) */}
      {form.recent.length > 0 || venueGossip ? (
        <div className="mb-4 space-y-3">
          {form.recent.length > 0 ? <FormStrip form={form} /> : null}
          <GossipLine>{venueGossip}</GossipLine>
        </div>
      ) : null}
      <div className="mb-10">
        <Suspense fallback={<GossipCardSkeleton />}>
          <GossipCardAsync playerId={id} />
        </Suspense>
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
          <Suspense fallback={<RacketRecoSkeleton />}>
            <RacketRecoAsync rating={player.rating} attributes={a} gear={gear} />
          </Suspense>
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

      {/* Scoring form + field position */}
      {ppg.length >= 2 ? (
        <div className="card p-6 mb-6">
          <p className="mono-label mb-1">Scoring form</p>
          <p className="text-body-muted text-sm mb-3">
            Average points per game, event by event · hover for detail.
          </p>
          <PpgSparkline points={ppg} />
        </div>
      ) : null}
      <div className="card p-6 mb-12">
        <p className="mono-label mb-1">Field position</p>
        <p className="text-body-muted text-sm mb-4">
          Where this rating sits across the field&apos;s level bands.
        </p>
        <RatingHistogram bins={fieldBins} markerRating={player.rating} height={200} />
      </div>

      {/* Partnerships & rivalries */}
      <div className="grid md:grid-cols-2 gap-6 mb-12">
        <PartnerChemistryCard chemistry={chemistry} />
        <RivalriesCard playerId={id} rivalries={rivalry} />
      </div>

      {/* Achievements */}
      <div className="mb-12">
        <AchievementsCard achievements={achievements} />
      </div>

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

// "X more wins to unlock <Band>" — only rendered while the reliability gate is
// the binding constraint (the rating sits exactly at the band ceiling). A
// performance-limited player sees nothing, since unlocking wouldn't lift them.
function ReliabilityGate({ score, wins, rating }: { score: number; wins: number; rating: number }) {
  const cap = reliabilityCap({ score, wins });
  const gate = nextReliabilityGate({ score, wins });
  if (!gate || rating < cap - 1e-9) return null;

  const band = levelForRating(gate.tier.level);
  const needs = [
    gate.scoreNeeded > 0 ? `${gate.scoreNeeded} more net ${gate.scoreNeeded === 1 ? "point" : "points"}` : null,
    gate.winsNeeded > 0 ? `${gate.winsNeeded} more ${gate.winsNeeded === 1 ? "win" : "wins"}` : null,
  ]
    .filter(Boolean)
    .join(" and ");

  return (
    <div className="card p-4 mb-10">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="mono-label">Next level</span>
        <span
          className="level-chip"
          style={{ color: band.color, borderColor: `${band.color}55`, backgroundColor: `${band.color}12` }}
        >
          <span aria-hidden>{band.badge}</span>
          {band.category}
        </span>
        <span className="text-sm text-body-muted">
          {needs} to unlock <span className="text-ink font-medium">{band.category}</span> (level{" "}
          {gate.tier.level.toFixed(1)}). Your rating is held at {cap.toFixed(1)} until then.
        </span>
        <Link href="/how-it-works" className="btn-secondary text-sm sm:ml-auto">
          How rating works
        </Link>
      </div>
      <div className="grid sm:grid-cols-2 gap-x-8 gap-y-3 mt-4">
        <GateBar label="Net points" value={score} target={gate.tier.minScore} />
        <GateBar label="Wins" value={wins} target={gate.tier.minWins} />
      </div>
    </div>
  );
}

// A single reliability-gate progress bar: how far the player's earned total
// (net points or wins) has climbed toward the next band's bar. Green + a tick
// once that half is cleared, coral while it's still the thing holding them back.
function GateBar({ label, value, target }: { label: string; value: number; target: number }) {
  const pct = Math.min(100, Math.round((Math.max(0, value) / target) * 100));
  const done = value >= target;
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs mb-1">
        <span className="mono-label">{label}</span>
        <span className="font-mono tabular-nums text-body-muted">
          {Math.min(Math.max(0, value), target)} / {target}
          {done ? <span className="text-deep-green"> ✓</span> : null}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-soft-stone overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: done ? "#1f8a4c" : "#ff7759" }}
        />
      </div>
    </div>
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
