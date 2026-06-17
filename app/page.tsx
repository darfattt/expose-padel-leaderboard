import Link from "next/link";
import { getLeaderboard } from "@/lib/leaderboard";
import { getClubs } from "@/lib/clubs";
import { levelForRating } from "@/lib/levels";

export const dynamic = "force-dynamic";

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ club?: string }>;
}) {
  const { club: clubParam } = await searchParams;
  const clubs = await getClubs();
  const activeClub = clubs.find((c) => c.id === clubParam) ?? null;
  const board = await getLeaderboard(activeClub?.id);
  const ranked = board.filter((p) => !p.provisional);
  const provisional = board.filter((p) => p.provisional);

  return (
    <div>
      {/* Hero */}
      <section className="mb-10">
        <p className="mono-label mb-4">Expose Leaderboard</p>
        <h1 className="font-display text-[64px] leading-[0.95] tracking-tightest max-w-3xl">
          Every match, every player, one board.
        </h1>
        <p className="text-body-muted text-xs mt-5 max-w-xl">
          Ratings blend win rate, point differential, and scoring across {activeClub ? "this club's" : "all uploaded"} events,
          on a 0–10 scale mapped to Playtomic-style levels. Upload a Reclub scoresheet to update it.
        </p>
      </section>

      {clubs.length > 0 && (
        <nav className="mb-10 flex flex-wrap gap-2 border-b border-hairline pb-4">
          <ClubTab href="/" label="All clubs" active={!activeClub} />
          {clubs.map((c) => (
            <ClubTab
              key={c.id}
              href={`/?club=${c.id}`}
              label={c.name}
              active={activeClub?.id === c.id}
            />
          ))}
        </nav>
      )}

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
  const cols =
    "grid-cols-[3rem_1fr_4rem_10rem_8rem_4.5rem_3.5rem_4rem_4.5rem]";
  return (
    <div className="border-t border-hairline">
      {/* header row */}
      <div className={`hidden sm:grid ${cols} gap-4 py-3 mono-label border-b border-hairline`}>
        <span>#</span>
        <span>Player</span>
        <span className="text-right">Rating</span>
        <span>Level</span>
        <span>Archetype</span>
        <span className="text-right">W–L</span>
        <span className="text-right">GP</span>
        <span className="text-right">Win %</span>
        <span className="text-right">Pts</span>
      </div>
      {rows.map((p) => {
        const level = levelForRating(p.rating);
        return (
          <Link
            key={p.row.player_id}
            href={`/players/${p.row.player_id}`}
            className={`grid ${cols} gap-4 items-center py-4 border-b border-hairline hover:bg-soft-stone/40 transition-colors`}
          >
            <span className="font-display text-xl tabular-nums text-slate">
              {provisional ? "—" : p.rank}
            </span>
            <span className="font-display text-lg tracking-tight">{p.row.name}</span>
            <span className="text-right font-mono text-lg tabular-nums">
              {p.rating.toFixed(1)}
            </span>
            <span>
              <LevelBadge level={level} />
            </span>
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
        );
      })}
    </div>
  );
}

function ClubTab({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`rounded-full border px-4 py-1.5 text-sm transition-colors ${
        active
          ? "border-primary bg-primary text-white"
          : "border-card-border text-body-muted hover:border-slate hover:text-ink"
      }`}
    >
      {label}
    </Link>
  );
}

function LevelBadge({ level }: { level: ReturnType<typeof levelForRating> }) {
  return (
    <span
      className="level-chip"
      style={{ color: level.color, borderColor: `${level.color}55`, backgroundColor: `${level.color}12` }}
      title={`${level.category} — ${level.description}`}
    >
      <span aria-hidden>{level.badge}</span>
      {level.category}
    </span>
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
