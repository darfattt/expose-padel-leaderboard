import Link from "next/link";
import { getLeaderboard } from "@/lib/leaderboard";

export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  const board = await getLeaderboard();
  const ranked = board.filter((p) => !p.provisional);
  const provisional = board.filter((p) => p.provisional);

  return (
    <div>
      {/* Hero */}
      <section className="mb-16">
        <p className="mono-label mb-4">Career leaderboard</p>
        <h1 className="font-display text-[64px] leading-[0.95] tracking-tightest max-w-3xl">
          Every match, every player, one board.
        </h1>
        <p className="text-body-muted text-lg mt-5 max-w-xl">
          Ratings blend win rate, point differential, and scoring across all uploaded events.
          Upload a Reclub scoresheet to update it.
        </p>
        {/* <div className="mt-7">
          <Link href="/upload" className="btn-primary">
            Upload scoresheet
          </Link>
        </div> */}
      </section>

      {board.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <Board rows={ranked} />
          {provisional.length > 0 && (
            <section className="mt-12">
              <p className="mono-label mb-3">Provisional · fewer than 3 games</p>
              <Board rows={provisional} provisional />
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Board({
  rows,
  provisional = false,
}: {
  rows: Awaited<ReturnType<typeof getLeaderboard>>;
  provisional?: boolean;
}) {
  return (
    <div className="border-t border-hairline">
      {/* header row */}
      <div className="hidden sm:grid grid-cols-[3rem_1fr_5rem_9rem_5rem_4rem_4rem_5rem] gap-4 py-3 mono-label border-b border-hairline">
        <span>#</span>
        <span>Player</span>
        <span className="text-right">Rating</span>
        <span>Archetype</span>
        <span className="text-right">W–L</span>
        <span className="text-right">GP</span>
        <span className="text-right">Win %</span>
        <span className="text-right">Pts</span>
      </div>
      {rows.map((p) => (
        <Link
          key={p.row.player_id}
          href={`/players/${p.row.player_id}`}
          className="grid grid-cols-[3rem_1fr_5rem_9rem_5rem_4rem_4rem_5rem] gap-4 items-center py-4 border-b border-hairline hover:bg-soft-stone/40 transition-colors"
        >
          <span className="font-display text-xl tabular-nums text-slate">
            {provisional ? "—" : p.rank}
          </span>
          <span className="font-display text-lg tracking-tight">{p.row.name}</span>
          <span className="text-right font-mono text-lg tabular-nums">{p.rating}</span>
          <span>
            <span className="archetype-chip">{p.archetype.label}</span>
          </span>
          <span className="text-right tabular-nums text-body-muted">
            {p.row.wins}–{p.row.losses}
            {p.row.draws ? `–${p.row.draws}` : ""}
          </span>
          <span className="text-right tabular-nums text-body-muted">{p.row.games}</span>
          <span className="text-right tabular-nums text-body-muted">
            {Math.round(p.metrics.winRate * 100)}%
          </span>
          <span className="text-right tabular-nums text-body-muted">{p.row.points_for}</span>
        </Link>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="card p-12 text-center">
      <h2 className="font-display text-2xl tracking-tight mb-2">No events yet</h2>
      <p className="text-body-muted mb-6 max-w-md mx-auto">
        Upload your first Reclub scoresheet to build the leaderboard. Players are matched across
        events automatically.
      </p>
      <Link href="/upload" className="btn-primary">
        Upload scoresheet
      </Link>
    </div>
  );
}
