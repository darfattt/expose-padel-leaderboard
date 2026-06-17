import Link from "next/link";
import { notFound } from "next/navigation";
import { computeEventAwards } from "@/lib/awards";
import { fetchCareerStats, getLeaderboard } from "@/lib/leaderboard";
import { getEvent, getEventPlayerResults, getEventResults } from "@/lib/queries";
import EventAwards from "./EventAwards";

export const dynamic = "force-dynamic";

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [event, matches, playerResults, board, career] = await Promise.all([
    getEvent(id),
    getEventResults(id),
    getEventPlayerResults(id),
    getLeaderboard(),
    fetchCareerStats(),
  ]);
  if (!event) notFound();

  // Awards need cross-event context: the global rating field (Biggest Upset) and
  // career stats (Most Improved). Both are derived read-time like the leaderboard.
  const awards = computeEventAwards(playerResults, {
    ratingById: new Map(board.map((p) => [p.row.player_id, p.rating])),
    careerById: new Map(career.map((c) => [c.player_id, c])),
  });

  // Group by round for a court-by-court layout.
  const rounds = new Map<number, typeof matches>();
  for (const m of matches) {
    const list = rounds.get(m.round) ?? [];
    list.push(m);
    rounds.set(m.round, list);
  }
  const roundNums = [...rounds.keys()].sort((a, b) => a - b);

  return (
    <div>
      <Link href="/" className="btn-secondary text-sm">
        ← Leaderboard
      </Link>

      <div className="mt-4 mb-10">
        <p className="mono-label mb-3">Event recap</p>
        <h1 className="font-display text-[48px] leading-none tracking-tight">{event.title}</h1>
        {event.club_name && <p className="mono-label mt-3">{event.club_name}</p>}
        <p className="text-body-muted mt-2">
          {[event.played_on, event.location, event.format].filter(Boolean).join(" · ")}
        </p>
        <div className="flex gap-6 mt-5 text-sm text-body-muted">
          <span>
            <strong className="text-ink">{matches.length}</strong> matches
          </span>
          {event.num_players != null && (
            <span>
              <strong className="text-ink">{event.num_players}</strong> players
            </span>
          )}
          {event.num_courts != null && (
            <span>
              <strong className="text-ink">{event.num_courts}</strong> courts
            </span>
          )}
        </div>
      </div>

      <EventAwards awards={awards} />

      <div className="space-y-8">
        {roundNums.map((rn) => (
          <section key={rn}>
            <p className="mono-label mb-3">Round {rn}</p>
            <div className="grid sm:grid-cols-2 gap-4">
              {rounds
                .get(rn)!
                .sort((a, b) => a.court - b.court)
                .map((m) => (
                  <div key={m.matchId} className="card p-4">
                    <p className="mono-label mb-3">Court {m.court}</p>
                    <TeamRow names={m.team1} score={m.team1Score} won={m.team1Score > m.team2Score} />
                    <div className="h-px bg-hairline my-2" />
                    <TeamRow names={m.team2} score={m.team2Score} won={m.team2Score > m.team1Score} />
                  </div>
                ))}
            </div>
          </section>
        ))}
        {matches.length === 0 && <p className="text-body-muted">No matches found for this event.</p>}
      </div>
    </div>
  );
}

function TeamRow({ names, score, won }: { names: string[]; score: number; won: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-3 ${won ? "" : "text-body-muted"}`}>
      <span className={won ? "font-medium" : ""}>{names.join(" & ") || "—"}</span>
      <span className="font-mono text-lg tabular-nums">{score}</span>
    </div>
  );
}
