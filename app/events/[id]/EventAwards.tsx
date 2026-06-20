import Link from "next/link";
import type { AwardWinner, EventAwards as EventAwardsData } from "@/lib/awards";
import { RECAP_AWARDS, type RecapQuips } from "@/lib/recap";

// Per-event "story" badges (MVP, Best Duo, Upset, Demolition, Most Improved,
// Heartbreak). Renders nothing when no award has a winner — pages without enough
// data just skip the section. When LLM `quips` are supplied each card leads with
// the witty line and keeps the stat as the muted footnote; otherwise the stat
// stands on its own.
export default function EventAwards({
  awards,
  quips = {},
}: {
  awards: EventAwardsData;
  quips?: RecapQuips;
}) {
  const present = RECAP_AWARDS.filter((a) => awards[a.key] !== null);
  if (present.length === 0) return null;

  return (
    <section className="mb-10">
      <p className="mono-label mb-3">Awards</p>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {present.map((a) => (
          <AwardCard
            key={a.key}
            badge={a.badge}
            title={a.label}
            winner={awards[a.key]!}
            quip={quips[a.key]}
          />
        ))}
      </div>
    </section>
  );
}

function AwardCard({
  badge,
  title,
  winner,
  quip,
}: {
  badge: string;
  title: string;
  winner: AwardWinner;
  quip?: string;
}) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xl" aria-hidden>
          {badge}
        </span>
        <span className="mono-label">{title}</span>
      </div>
      <p className="font-display text-lg leading-tight tracking-tight">
        {winner.names.map((name, i) => (
          <span key={winner.playerIds[i]}>
            {i > 0 && <span className="text-muted"> &amp; </span>}
            <Link href={`/players/${winner.playerIds[i]}`} className="hover:opacity-70">
              {name}
            </Link>
          </span>
        ))}
      </p>
      {quip && <p className="text-ink text-sm mt-1.5">{quip}</p>}
      <p className="text-body-muted text-sm mt-1">{winner.detail}</p>
    </div>
  );
}
