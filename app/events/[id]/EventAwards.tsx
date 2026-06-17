import Link from "next/link";
import type { AwardWinner, EventAwards as EventAwardsData } from "@/lib/awards";

// Per-event "story" badges (MVP, Most Improved, Biggest Upset, Best Partnership).
// Renders nothing when no award has a winner — pages without enough data just
// skip the section.
const AWARDS: { key: keyof EventAwardsData; badge: string; title: string }[] = [
  { key: "mvp", badge: "🏅", title: "MVP" },
  { key: "bestPartnership", badge: "🤝", title: "Best Partnership" },
  { key: "biggestUpset", badge: "⚡", title: "Biggest Upset" },
  { key: "mostImproved", badge: "📈", title: "Most Improved" },
];

export default function EventAwards({ awards }: { awards: EventAwardsData }) {
  const present = AWARDS.filter((a) => awards[a.key] !== null);
  if (present.length === 0) return null;

  return (
    <section className="mb-10">
      <p className="mono-label mb-3">Awards</p>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {present.map((a) => (
          <AwardCard key={a.key} badge={a.badge} title={a.title} winner={awards[a.key]!} />
        ))}
      </div>
    </section>
  );
}

function AwardCard({ badge, title, winner }: { badge: string; title: string; winner: AwardWinner }) {
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
      <p className="text-body-muted text-sm mt-1">{winner.detail}</p>
    </div>
  );
}
