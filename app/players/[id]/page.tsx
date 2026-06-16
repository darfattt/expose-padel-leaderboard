import Link from "next/link";
import { notFound } from "next/navigation";
import { getRankedPlayer } from "@/lib/leaderboard";
import { getPlayer, getPlayerMatchHistory } from "@/lib/queries";
import { reportsEnabled } from "@/lib/report";
import { getOrCreatePlayerReport } from "@/app/actions/report";
import AttributeRadar from "./AttributeRadar";
import ReportCard from "./ReportCard";

export const dynamic = "force-dynamic";

export default async function PlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const player = await getRankedPlayer(id);

  if (!player) {
    const exists = await getPlayer(id);
    if (!exists) notFound();
    // Player exists but has no games yet.
    return (
      <div>
        <BackLink />
        <h1 className="font-display text-[48px] tracking-tight mt-4">{exists.name}</h1>
        <p className="text-body-muted mt-2">No games recorded yet.</p>
      </div>
    );
  }

  const [matches, report] = await Promise.all([
    getPlayerMatchHistory(id),
    getOrCreatePlayerReport(id),
  ]);
  const r = player.row;
  const a = player.attributes;

  return (
    <div>
      <BackLink />

      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4 mt-4 mb-10">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="archetype-chip">{player.archetype.label}</span>
            {player.provisional ? (
              <span className="mono-label text-coral">Provisional</span>
            ) : (
              <span className="mono-label">Rank #{player.rank}</span>
            )}
          </div>
          <h1 className="font-display text-[56px] leading-none tracking-tight">{r.name}</h1>
          <p className="text-body-muted mt-2 max-w-md">{player.archetype.description}</p>
        </div>
        <div className="text-right">
          <div className="font-display text-[64px] leading-none tracking-tightest">
            {player.rating}
          </div>
          <div className="mono-label mt-1">Rating / 100</div>
        </div>
      </div>

      {/* Radar + report */}
      <div className="grid md:grid-cols-2 gap-6 mb-10">
        <div className="card p-6">
          <p className="mono-label mb-2">Attributes</p>
          <AttributeRadar attributes={a} />
          <div className="grid grid-cols-5 gap-2 mt-2 text-center">
            {[
              ["ATK", a.attack],
              ["DEF", a.defense],
              ["CON", a.consistency],
              ["CLT", a.clutch],
              ["WIN", a.win],
            ].map(([label, v]) => (
              <div key={label as string}>
                <div className="font-mono text-lg tabular-nums">{v}</div>
                <div className="mono-label">{label}</div>
              </div>
            ))}
          </div>
        </div>
        <ReportCard playerId={id} initial={report} enabled={reportsEnabled()} />
      </div>

      {/* Stat lines */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-12">
        <StatLine label="Record" value={`${r.wins}–${r.losses}${r.draws ? `–${r.draws}` : ""}`} />
        <StatLine label="Games" value={String(r.games)} />
        <StatLine
          label="Point diff"
          value={`${r.point_diff >= 0 ? "+" : ""}${r.point_diff}`}
        />
        <StatLine label="Close games" value={`${r.close_wins}/${r.close_games}`} />
        <StatLine label="Points for" value={String(r.points_for)} />
        <StatLine label="Points against" value={String(r.points_against)} />
        <StatLine label="Win rate" value={`${Math.round(player.metrics.winRate * 100)}%`} />
        <StatLine label="Pts / game" value={player.metrics.ppg.toFixed(1)} />
      </div>

      {/* Match history */}
      <section>
        <p className="mono-label mb-3">Match history · {matches.length} games</p>
        <div className="border-t border-hairline">
          {matches.map((m) => (
            <div
              key={m.matchId}
              className="grid grid-cols-[2.5rem_1fr_4rem_2rem] sm:grid-cols-[6rem_1fr_5rem_2.5rem] gap-3 items-center py-3 border-b border-hairline text-sm"
            >
              <Link
                href={`/events/${m.eventId}`}
                className="mono-label hover:text-ink truncate"
                title={m.eventTitle}
              >
                R{m.round}
              </Link>
              <span className="text-body-muted truncate">
                <span className="text-ink">{m.partner ?? "—"}</span>
                <span className="text-muted"> vs </span>
                {m.opponents.join(" & ") || "—"}
              </span>
              <span className="font-mono tabular-nums text-right">
                {m.points}–{m.conceded}
              </span>
              <span
                className={`text-right font-medium ${
                  m.result === "W" ? "text-deep-green" : m.result === "L" ? "text-muted" : "text-slate"
                }`}
              >
                {m.result}
              </span>
            </div>
          ))}
          {matches.length === 0 && (
            <p className="text-body-muted py-6">No matches recorded.</p>
          )}
        </div>
      </section>
    </div>
  );
}

function BackLink() {
  return (
    <Link href="/" className="btn-secondary text-sm">
      ← Leaderboard
    </Link>
  );
}

function StatLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-t border-hairline pt-3">
      <div className="font-display text-2xl tracking-tight tabular-nums">{value}</div>
      <div className="mono-label mt-1">{label}</div>
    </div>
  );
}
