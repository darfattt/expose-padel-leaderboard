import Link from "next/link";
import LeaderboardBoard, { ProvisionalBoard } from "@/app/components/LeaderboardBoard";
import { getLeaderboardView, LEADERBOARD_PAGE_SIZE } from "@/lib/leaderboard";
import { getClubs } from "@/lib/clubs";
import { resolveAvatars } from "@/lib/queries";
import { formatMonth } from "@/lib/standings";

export const dynamic = "force-dynamic";

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ club?: string; period?: string }>;
}) {
  const { club: clubParam, period: periodParam } = await searchParams;
  const clubs = await getClubs();
  const activeClub = clubs.find((c) => c.id === clubParam) ?? null;
  const { board, months, period } = await getLeaderboardView(activeClub?.id, periodParam);
  const ranked = board.filter((p) => !p.provisional);
  const provisional = board.filter((p) => p.provisional);

  // Ship only the first page of ranked rows; the rest stream in on scroll via a
  // Server Action (see LeaderboardBoard). Provisional players are a small list
  // rendered in full.
  const firstPage = ranked.slice(0, LEADERBOARD_PAGE_SIZE);

  // Resolve a Reclub avatar per visible player (stored value, or read live off
  // the profile page — cached daily). Players without a link map to null →
  // initials. Avatars for later pages are resolved by the load-more action.
  const avatars = await resolveAvatars(
    [...firstPage, ...provisional].map((p) => p.row.player_id)
  );

  // Carry the active club through period links (and vice-versa).
  const withClub = (params: Record<string, string>) => {
    const sp = new URLSearchParams(params);
    if (activeClub) sp.set("club", activeClub.id);
    const qs = sp.toString();
    return qs ? `/?${qs}` : "/";
  };

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
          on Playtomic's 0–7 level scale. Upload a Reclub scoresheet to update it.
        </p>
      </section>

      {clubs.length > 0 && (
        <nav className="mb-6 flex flex-wrap gap-2 border-b border-hairline pb-4">
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

      {months.length > 0 && (
        <nav className="mb-10 flex flex-wrap items-center gap-2">
          <span className="mono-label mr-1">Period</span>
          <ClubTab href={withClub({})} label="All time" active={period === "all"} />
          {months.map((m) => (
            <ClubTab key={m} href={withClub({ period: m })} label={formatMonth(m)} active={period === m} />
          ))}
        </nav>
      )}

      {board.length === 0 ? (
        <EmptyState monthly={period !== "all"} />
      ) : (
        <>
          <LeaderboardBoard
            initialRows={firstPage}
            initialAvatars={avatars}
            clubId={activeClub?.id}
            period={period}
            initialOffset={firstPage.length}
            initialHasMore={firstPage.length < ranked.length}
          />
          {provisional.length > 0 && (
            <section className="mt-12">
              <p className="mono-label mb-3">Provisional · fewer than 3 games</p>
              <ProvisionalBoard rows={provisional} avatars={avatars} />
            </section>
          )}
        </>
      )}
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

function EmptyState({ monthly = false }: { monthly?: boolean }) {
  if (monthly) {
    return (
      <div className="card p-12 text-center">
        <h2 className="font-display text-2xl tracking-tight mb-2">No games this period</h2>
        <p className="text-body-muted max-w-md mx-auto">
          No events fall in the selected month. Pick another period or view the all-time board.
        </p>
      </div>
    );
  }
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
