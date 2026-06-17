import Link from "next/link";
import { notFound } from "next/navigation";
import { h2hHook } from "@/lib/gossip";
import { getPlayer, getPlayerMatchHistory } from "@/lib/queries";
import { headToHead } from "@/lib/relationships";
import { GossipLine, RESULT_TEXT, recordLabel, winPct } from "../../relationship-ui";

export const dynamic = "force-dynamic";

export default async function HeadToHeadPage({
  params,
}: {
  params: Promise<{ id: string; oppId: string }>;
}) {
  const { id, oppId } = await params;
  const [matches, player, opponent] = await Promise.all([
    getPlayerMatchHistory(id),
    getPlayer(id),
    getPlayer(oppId),
  ]);

  if (!player || !opponent) notFound();

  const { record, games } = headToHead(matches, oppId);
  if (games.length === 0) notFound(); // they have never met

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <Link href={`/players/${id}`} className="btn-secondary text-sm">
          ← {player.name}
        </Link>
        <Link href={`/versus?a=${id}&b=${oppId}`} className="btn-secondary text-sm">
          Full tale of the tape →
        </Link>
      </div>

      {/* Header */}
      <div className="mt-4 mb-10">
        <p className="mono-label mb-2">Head to head</p>
        <h1 className="font-display text-[48px] leading-none tracking-tight">
          {player.name} <span className="text-muted">vs</span>{" "}
          <Link href={`/players/${oppId}`} className="hover:opacity-70">
            {opponent.name}
          </Link>
        </h1>
        <div className="mt-4 max-w-xl">
          <GossipLine>{h2hHook(player.name, opponent.name, record)}</GossipLine>
        </div>
      </div>

      {/* Record (from player's perspective) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-12">
        <StatLine label={`${player.name} record`} value={recordLabel(record)} />
        <StatLine label="Games" value={String(record.games)} />
        <StatLine label="Win rate" value={winPct(record)} />
        <StatLine
          label="Point diff"
          value={`${record.pointDiff >= 0 ? "+" : ""}${record.pointDiff}`}
        />
      </div>

      {/* Shared games */}
      <section>
        <p className="mono-label mb-3">Shared games · {games.length}</p>
        <div className="overflow-x-auto">
          <div className="min-w-[640px]">
            <div className="grid grid-cols-[9rem_2.5rem_1fr_4.5rem_2.5rem] gap-3 items-center py-2 border-b border-hairline mono-label">
              <span>Event</span>
              <span>Round</span>
              <span>Players</span>
              <span className="text-right">Score</span>
              <span className="text-right">Result</span>
            </div>
            {games.map((m) => (
              <div
                key={m.matchId}
                className="grid grid-cols-[9rem_2.5rem_1fr_4.5rem_2.5rem] gap-3 items-center py-3 border-b border-hairline text-sm"
              >
                <Link
                  href={`/events/${m.eventId}`}
                  className="truncate text-ink hover:opacity-70"
                  title={m.eventTitle}
                >
                  {m.eventTitle}
                </Link>
                <span className="mono-label">R{m.round}</span>
                <span className="text-body-muted truncate">
                  <span className="text-ink">
                    {player.name}
                    {m.partner ? ` & ${m.partner}` : ""}
                  </span>
                  <span className="text-muted"> vs </span>
                  {m.opponents.join(" & ") || "—"}
                </span>
                <span className="font-mono tabular-nums text-right">
                  {m.points}–{m.conceded}
                </span>
                <span className={`text-right font-medium ${RESULT_TEXT[m.result]}`}>{m.result}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
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
