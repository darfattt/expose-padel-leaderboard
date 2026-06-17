import Link from "next/link";
import { getRacketBrandLeaderboard, type BrandGroup } from "@/lib/racket-leaderboard";
import { getClubs } from "@/lib/clubs";
import { levelForRating } from "@/lib/levels";
import { formatMonth } from "@/lib/standings";

export const dynamic = "force-dynamic";

export default async function RacketLeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ club?: string; period?: string }>;
}) {
  const { club: clubParam, period: periodParam } = await searchParams;
  const clubs = await getClubs();
  const activeClub = clubs.find((c) => c.id === clubParam) ?? null;
  const { groups, months, period, unassigned } = await getRacketBrandLeaderboard(
    activeClub?.id,
    periodParam
  );

  // Carry the active club through period links (and vice-versa).
  const withClub = (params: Record<string, string>) => {
    const sp = new URLSearchParams(params);
    if (activeClub) sp.set("club", activeClub.id);
    const qs = sp.toString();
    return qs ? `/rackets?${qs}` : "/rackets";
  };
  const clubHref = (params: Record<string, string>) => {
    const qs = new URLSearchParams(params).toString();
    return qs ? `/rackets?${qs}` : "/rackets";
  };

  return (
    <div>
      {/* Hero */}
      <section className="mb-10">
        <p className="mono-label mb-4">By Racket Brand</p>
        <h1 className="font-display text-[64px] leading-[0.95] tracking-tightest max-w-3xl">
          Which racket wins the field?
        </h1>
        <p className="text-body-muted text-xs mt-5 max-w-xl">
          Brands ranked by the average rating of the players who wield them. Each player&apos;s racket
          comes from their profile gear — set yours on any player page to join the count.
        </p>
      </section>

      {clubs.length > 0 && (
        <nav className="mb-6 flex flex-wrap gap-2 border-b border-hairline pb-4">
          <Tab href={clubHref({})} label="All clubs" active={!activeClub} />
          {clubs.map((c) => (
            <Tab key={c.id} href={clubHref({ club: c.id })} label={c.name} active={activeClub?.id === c.id} />
          ))}
        </nav>
      )}

      {months.length > 0 && (
        <nav className="mb-10 flex flex-wrap items-center gap-2">
          <span className="mono-label mr-1">Period</span>
          <Tab href={withClub({})} label="All time" active={period === "all"} />
          {months.map((m) => (
            <Tab key={m} href={withClub({ period: m })} label={formatMonth(m)} active={period === m} />
          ))}
        </nav>
      )}

      {groups.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <BrandStandings groups={groups} />
          <section className="mt-14 space-y-12">
            {groups.map((g) => (
              <BrandSection key={g.brand} group={g} />
            ))}
          </section>
          {unassigned > 0 && (
            <p className="mt-10 text-xs text-muted">
              {unassigned} ranked {unassigned === 1 ? "player has" : "players have"} no racket set, so
              {unassigned === 1 ? " they are" : " they are"} not counted above.
            </p>
          )}
        </>
      )}
    </div>
  );
}

// Brands ranked head-to-head by their players' average rating.
function BrandStandings({ groups }: { groups: BrandGroup[] }) {
  const cols = "grid-cols-[3rem_1fr_5rem_6rem_1fr]";
  const maxAvg = Math.max(...groups.map((g) => g.avgRating), 1);
  return (
    <div className="border-t border-hairline">
      <div className={`hidden sm:grid ${cols} gap-4 py-3 mono-label border-b border-hairline`}>
        <span>#</span>
        <span>Brand</span>
        <span className="text-right">Players</span>
        <span className="text-right">Avg rating</span>
        <span>Top player</span>
      </div>
      {groups.map((g, i) => (
        <div
          key={g.brand}
          className="grid grid-cols-[3rem_1fr] sm:grid-cols-[3rem_1fr_5rem_6rem_1fr] gap-4 items-center py-4 border-b border-hairline"
        >
          <span className="font-display text-xl tabular-nums text-slate">{i + 1}</span>
          <span className="font-display text-lg tracking-tight">{g.brand}</span>
          <span className="hidden sm:block text-right tabular-nums text-body-muted">{g.playerCount}</span>
          <span className="hidden sm:flex items-center justify-end gap-2">
            <span
              aria-hidden
              className="hidden md:block h-1.5 rounded-full bg-primary/70"
              style={{ width: `${Math.round((g.avgRating / maxAvg) * 48)}px` }}
            />
            <span className="font-mono text-lg tabular-nums">{g.avgRating.toFixed(1)}</span>
          </span>
          <span className="hidden sm:block truncate text-body-muted text-sm">{g.topPlayer}</span>
        </div>
      ))}
    </div>
  );
}

// A single brand and the players using it, ranked.
function BrandSection({ group }: { group: BrandGroup }) {
  const cover = group.players.find((p) => p.racket.image)?.racket.image ?? null;
  const cols = "grid-cols-[2.5rem_1fr_4rem_9rem_3.5rem_4rem]";
  return (
    <section>
      <div className="flex items-center gap-4 mb-4">
        {cover && (
          // eslint-disable-next-line @next/next/no-img-element -- remote Padelful URL; avoids next/image domain config
          <img src={cover} alt="" className="h-12 w-12 object-contain" />
        )}
        <div>
          <h2 className="font-display text-2xl tracking-tight">{group.brand}</h2>
          <p className="mono-label mt-1">
            {group.playerCount} {group.playerCount === 1 ? "player" : "players"} · avg{" "}
            {group.avgRating.toFixed(1)}
          </p>
        </div>
      </div>
      <div className="border-t border-hairline">
        <div className={`hidden sm:grid ${cols} gap-4 py-3 mono-label border-b border-hairline`}>
          <span>#</span>
          <span>Player</span>
          <span className="text-right">Rating</span>
          <span>Racket</span>
          <span className="text-right">GP</span>
          <span className="text-right">Win %</span>
        </div>
        {group.players.map((p) => {
          const level = levelForRating(p.rating);
          return (
            <Link
              key={p.row.player_id}
              href={`/players/${p.row.player_id}`}
              className={`grid grid-cols-[2.5rem_1fr_4rem] sm:grid-cols-[2.5rem_1fr_4rem_9rem_3.5rem_4rem] gap-4 items-center py-3.5 border-b border-hairline hover:bg-soft-stone/40 transition-colors`}
            >
              <span className="font-display text-lg tabular-nums text-slate">
                {p.provisional ? "—" : p.rank}
              </span>
              <span className="min-w-0">
                <span className="font-display text-base tracking-tight">{p.row.name}</span>
                <span
                  className="level-chip ml-2 align-middle"
                  style={{ color: level.color, borderColor: `${level.color}55`, backgroundColor: `${level.color}12` }}
                >
                  <span aria-hidden>{level.badge}</span>
                  {level.category}
                </span>
              </span>
              <span className="text-right font-mono text-base tabular-nums">{p.rating.toFixed(1)}</span>
              <span className="hidden sm:block truncate text-body-muted text-sm">
                {p.racket.name ?? "—"}
              </span>
              <span className="hidden sm:block text-right tabular-nums text-body-muted">{p.row.games}</span>
              <span className="hidden sm:block text-right tabular-nums text-body-muted">
                {Math.round(p.metrics.winRate * 100)}%
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function Tab({ href, label, active }: { href: string; label: string; active: boolean }) {
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

function EmptyState() {
  return (
    <div className="card p-12 text-center">
      <h2 className="font-display text-2xl tracking-tight mb-2">No rackets set yet</h2>
      <p className="text-body-muted mb-6 max-w-md mx-auto">
        This board ranks brands by the players using them. Open a player&apos;s profile and pick their
        racket to put a brand on the board.
      </p>
      <Link href="/" className="btn-primary">
        Back to leaderboard
      </Link>
    </div>
  );
}
