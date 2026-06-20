import Link from "next/link";
import { getOrCreatePowerColumn } from "@/app/actions/power-rankings";
import ShareButton from "@/app/components/ShareButton";
import { getClubs } from "@/lib/clubs";
import { getLeaderboardView } from "@/lib/leaderboard";
import {
  buildPowerCaption,
  buildPowerRankings,
  buildPowerRankingsCard,
  hasPowerRankings,
  type Mover,
} from "@/lib/power-rankings";

export const dynamic = "force-dynamic";

export default async function PowerRankingsPage({
  searchParams,
}: {
  searchParams: Promise<{ club?: string }>;
}) {
  const { club: clubParam } = await searchParams;
  const clubs = await getClubs();
  const activeClub = clubs.find((c) => c.id === clubParam) ?? null;

  const [view, column] = await Promise.all([
    getLeaderboardView(activeClub?.id),
    getOrCreatePowerColumn(activeClub?.id),
  ]);
  const pr = buildPowerRankings(view.board);
  const scopeLabel = activeClub ? activeClub.name : "All clubs";
  const cardInput = { scopeLabel, headline: column?.headline };
  const spec = buildPowerRankingsCard(pr, cardInput);
  const caption = buildPowerCaption(pr, cardInput, column?.column);

  const empty = !hasPowerRankings(pr);

  return (
    <div>
      <Link href="/" className="btn-secondary text-sm">
        ← Leaderboard
      </Link>

      <div className="mt-4 mb-8">
        <p className="mono-label mb-3">Power Rankings</p>
        <h1 className="font-display text-[48px] leading-none tracking-tight">
          {column?.headline || "Movement since the last Match Night"}
        </h1>
        <p className="mono-label mt-3">{scopeLabel}</p>
      </div>

      {empty && (
        <p className="text-body-muted">
          Not enough ranked players yet — upload a couple more scoresheets and the rankings drop will
          fill in.
        </p>
      )}

      {!empty && (
        <>
          {column?.column && (
            <p className="font-display text-xl leading-snug tracking-tight max-w-2xl mb-8">
              {column.column}
            </p>
          )}

          <div className="mb-8">
            <ShareButton
              spec={spec}
              caption={caption}
              shareTitle={`Power Rankings — ${scopeLabel}`}
              filename="power-rankings.png"
              label="📲 Share the rankings"
              hint="This week's movers as one card — drop it in the group chat."
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-8">
            <MoverList title="👑 Top of the table" movers={pr.leaders} kind="leader" />
            <MoverList title="▲ Biggest climbers" movers={pr.climbers} kind="climber" />
            <MoverList title="▼ Biggest fallers" movers={pr.fallers} kind="faller" />
            <MoverList title="✦ Newly ranked" movers={pr.newcomers} kind="new" />
          </div>
        </>
      )}
    </div>
  );
}

function MoverList({
  title,
  movers,
  kind,
}: {
  title: string;
  movers: Mover[];
  kind: "leader" | "climber" | "faller" | "new";
}) {
  if (movers.length === 0) return null;
  return (
    <section>
      <p className="mono-label mb-3">{title}</p>
      <ul className="space-y-2">
        {movers.map((m) => (
          <li key={m.id} className="card p-3 flex items-center justify-between gap-3">
            <Link href={`/players/${m.id}`} className="font-medium hover:opacity-70">
              {m.name}
            </Link>
            <span className="flex items-center gap-3 text-sm text-body-muted">
              <span>{detailFor(m, kind)}</span>
              <span className="font-mono tabular-nums text-ink">#{m.rank}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function detailFor(m: Mover, kind: "leader" | "climber" | "faller" | "new"): string {
  if (kind === "climber" && m.delta != null) return `up ${m.delta}`;
  if (kind === "faller" && m.delta != null) return `down ${Math.abs(m.delta)}`;
  if (kind === "new") return "debut";
  return `${m.rating.toFixed(1)} · ${m.record}`;
}
