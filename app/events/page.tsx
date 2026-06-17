import Link from "next/link";
import { getEvents } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function EventsPage() {
  const events = await getEvents();

  return (
    <div>
      {/* Hero */}
      <section className="mb-16">
        <p className="mono-label mb-4">Events</p>
        <h1 className="font-display text-[64px] leading-[0.95] tracking-tightest max-w-3xl">
          Every session, every scoresheet.
        </h1>
        <p className="text-body-muted text-lg mt-5 max-w-xl">
          Each uploaded Reclub scoresheet becomes an event. Open one to see the round-by-round
          court results that feed the leaderboard.
        </p>
      </section>

      {events.length === 0 ? (
        <EmptyState />
      ) : (
        <EventsList events={events} />
      )}
    </div>
  );
}

function EventsList({ events }: { events: Awaited<ReturnType<typeof getEvents>> }) {
  const cols = "grid-cols-[1fr_8rem_10rem_8rem_5rem_5rem]";
  return (
    <div className="border-t border-hairline">
      <div className={`hidden sm:grid ${cols} gap-4 py-3 mono-label border-b border-hairline`}>
        <span>Event</span>
        <span>Club</span>
        <span>Date</span>
        <span>Location</span>
        <span className="text-right">Players</span>
        <span className="text-right">Courts</span>
      </div>
      {events.map((e) => (
        <Link
          key={e.id}
          href={`/events/${e.id}`}
          className={`grid ${cols} gap-4 items-center py-4 border-b border-hairline hover:bg-soft-stone/40 transition-colors`}
        >
          <span className="font-display text-lg tracking-tight">{e.title}</span>
          <span className="text-body-muted truncate">{e.club_name ?? "—"}</span>
          <span className="tabular-nums text-body-muted">{e.played_on ?? "—"}</span>
          <span className="text-body-muted truncate">{e.location ?? "—"}</span>
          <span className="text-right tabular-nums text-body-muted">{e.num_players ?? "—"}</span>
          <span className="text-right tabular-nums text-body-muted">{e.num_courts ?? "—"}</span>
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
        Upload your first Reclub scoresheet to create an event. Matches and players are extracted
        automatically.
      </p>
      <Link href="/upload" className="btn-primary">
        Upload scoresheet
      </Link>
    </div>
  );
}
