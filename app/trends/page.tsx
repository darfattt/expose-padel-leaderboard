import Link from "next/link";
import { archetypeDistribution, ratingHistogram } from "@/lib/distribution";
import { fetchRawResults, getLeaderboard } from "@/lib/leaderboard";
import { buildRankTrajectory } from "@/lib/trajectory";
import ArchetypePie from "./ArchetypePie";
import RatingHistogram from "./RatingHistogram";
import TrajectoryChart, { type TrajectoryLine } from "./TrajectoryChart";

export const dynamic = "force-dynamic";

// How many players the trajectory plot tracks — the top of the board, so the
// lines stay legible.
const TRAJECTORY_LINES = 8;

export default async function TrendsPage() {
  const [board, results] = await Promise.all([getLeaderboard(), fetchRawResults()]);
  const played = board.filter((p) => p.row.games > 0);

  const trajectory = buildRankTrajectory(results);
  const lines: TrajectoryLine[] = trajectory.series
    .filter((s) => s.finalRank !== null)
    .slice(0, TRAJECTORY_LINES)
    .map((s) => ({ id: s.id, name: s.name, ranks: s.points.map((p) => p.rank) }));

  const bins = ratingHistogram(played.map((p) => p.rating));
  const slices = archetypeDistribution(played.map((p) => p.archetype));

  if (played.length === 0) {
    return (
      <div>
        <Header />
        <EmptyState />
      </div>
    );
  }

  return (
    <div>
      <Header />

      {/* Rank trajectory */}
      <section className="mb-14">
        <div className="flex items-baseline justify-between gap-4 mb-1">
          <p className="mono-label">Rank trajectory</p>
          <span className="text-body-muted text-xs">top {Math.min(TRAJECTORY_LINES, lines.length)} · by month</span>
        </div>
        <p className="text-body-muted text-sm mb-4 max-w-2xl">
          Every month&apos;s standings as they stood at the time (cumulative, all-time). Lines that
          climb toward the top moved up the board; lines that dip slid down.
        </p>
        <div className="card p-4 sm:p-6">
          {trajectory.months.length >= 2 && lines.length > 0 ? (
            <TrajectoryChart months={trajectory.months} series={lines} />
          ) : (
            <p className="text-body-muted text-sm py-8 text-center">
              Need ranked players across at least two months to plot a trajectory. Upload more dated
              events to see the season take shape.
            </p>
          )}
        </div>
      </section>

      {/* Rating distribution + archetype split */}
      <div className="grid lg:grid-cols-2 gap-6">
        <section className="card p-6">
          <p className="mono-label mb-1">Rating distribution</p>
          <p className="text-body-muted text-sm mb-4">
            How the field spreads across the level bands · {played.length} players.
          </p>
          <RatingHistogram bins={bins} />
        </section>

        <section className="card p-6">
          <p className="mono-label mb-1">Playstyle split</p>
          <p className="text-body-muted text-sm mb-4">
            The archetype mix across the whole field · {slices.length}{" "}
            {slices.length === 1 ? "type" : "types"}.
          </p>
          <ArchetypePie slices={slices} />
        </section>
      </div>
    </div>
  );
}

function Header() {
  return (
    <section className="mb-10">
      <p className="mono-label mb-4">League trends</p>
      <h1 className="font-display text-[64px] leading-[0.95] tracking-tightest max-w-3xl">
        The season, in motion.
      </h1>
      <p className="text-body-muted text-xs mt-5 max-w-xl">
        How the board has moved over time, how skill is spread across the field, and what kinds of
        players make it up — all recomputed from the same facts behind the leaderboard.
      </p>
    </section>
  );
}

function EmptyState() {
  return (
    <div className="card p-12 text-center">
      <h2 className="font-display text-2xl tracking-tight mb-2">No trends yet</h2>
      <p className="text-body-muted mb-6 max-w-md mx-auto">
        Upload a Reclub scoresheet so there are players and events to chart.
      </p>
      <Link href="/upload" className="btn-primary">
        Upload scoresheet
      </Link>
    </div>
  );
}
