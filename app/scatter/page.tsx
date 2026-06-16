import Link from "next/link";
import { getLeaderboard } from "@/lib/leaderboard";
import ScatterPlot, { type ScatterPoint } from "./ScatterPlot";

export const dynamic = "force-dynamic";

export default async function ScatterPage() {
  const board = await getLeaderboard();
  // Only players who have actually played carry meaningful attributes.
  const points: ScatterPoint[] = board
    .filter((p) => p.row.games > 0)
    .map((p) => ({
      id: p.row.player_id,
      name: p.row.name,
      power: p.attributes.attack,
      win: p.attributes.win,
      clutch: p.attributes.clutch,
      consistency: p.attributes.consistency,
      games: p.row.games,
      provisional: p.provisional,
    }));

  return (
    <div>
      {/* Hero */}
      <section className="mb-10">
        <p className="mono-label mb-4">Scatter analysis</p>
        <h1 className="font-display text-[64px] leading-[0.95] tracking-tightest max-w-3xl">
          The whole field, mapped.
        </h1>
        <p className="text-body-muted text-lg mt-5 max-w-2xl">
          Every player plotted across all four attributes at once: <strong>Power</strong> and{" "}
          <strong>Win&nbsp;rate</strong> set the position, bubble <strong>size</strong> is{" "}
          <strong>Clutch</strong>, and bubble <strong>shade</strong> is <strong>Consistency</strong>.
          The two dividing lines split the court into four playstyle quadrants.
        </p>
      </section>

      {points.length === 0 ? (
        <EmptyState />
      ) : (
        <ScatterPlot points={points} />
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="card p-12 text-center">
      <h2 className="font-display text-2xl tracking-tight mb-2">Nothing to plot yet</h2>
      <p className="text-body-muted mb-6 max-w-md mx-auto">
        Upload a Reclub scoresheet so players have games to analyze. Attributes are computed
        relative to the whole field.
      </p>
      <Link href="/upload" className="btn-primary">
        Upload scoresheet
      </Link>
    </div>
  );
}
