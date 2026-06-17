import Link from "next/link";
import { buildH2HMatrix, h2hCell } from "@/lib/h2h-matrix";
import { getLeaderboard } from "@/lib/leaderboard";
import { getAllParticipants } from "@/lib/queries";
import MatrixHeatmap, { type MatrixCell, type MatrixPlayer } from "./MatrixHeatmap";

export const dynamic = "force-dynamic";

// How many players the grid shows before it gets unreadable. Ordered by rank, so
// this is the top of the board.
const MAX_PLAYERS = 16;

export default async function MatrixPage() {
  const [board, participants] = await Promise.all([getLeaderboard(), getAllParticipants()]);
  const matrix = buildH2HMatrix(participants);

  // Order by the live board (ranked first, in rank order; provisional after),
  // keeping only players who actually appear in someone's head-to-head.
  const met = new Set(matrix.ids);
  const ordered = board.filter((p) => met.has(p.row.player_id)).slice(0, MAX_PLAYERS);
  const players: MatrixPlayer[] = ordered.map((p) => ({
    id: p.row.player_id,
    name: p.row.name,
    rank: p.rank,
  }));

  const grid: (MatrixCell | null)[][] = players.map((rp) =>
    players.map((cp) => (rp.id === cp.id ? null : h2hCell(matrix, rp.id, cp.id)))
  );

  const hiddenCount = board.filter((p) => met.has(p.row.player_id)).length - players.length;

  return (
    <div>
      <section className="mb-10">
        <p className="mono-label mb-4">Head-to-head matrix</p>
        <h1 className="font-display text-[64px] leading-[0.95] tracking-tightest max-w-3xl">
          Who owns who.
        </h1>
        <p className="text-body-muted text-xs mt-5 max-w-xl">
          Every player&apos;s record against every other, on one board. Green means the row player
          wins the matchup; coral means they&apos;re on the wrong end of it. The deeper the colour,
          the more lopsided the rivalry.
        </p>
      </section>

      {players.length < 2 ? (
        <EmptyState />
      ) : (
        <>
          <MatrixHeatmap players={players} grid={grid} />
          {hiddenCount > 0 ? (
            <p className="text-body-muted text-xs mt-4">
              Showing the top {MAX_PLAYERS} ranked players · {hiddenCount} more not shown.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="card p-12 text-center">
      <h2 className="font-display text-2xl tracking-tight mb-2">Not enough rivalries yet</h2>
      <p className="text-body-muted mb-6 max-w-md mx-auto">
        The matrix needs at least two players who have faced each other. Upload a Reclub scoresheet
        to start filling it in.
      </p>
      <Link href="/upload" className="btn-primary">
        Upload scoresheet
      </Link>
    </div>
  );
}
