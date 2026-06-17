import Link from "next/link";
import { rivalryHook } from "@/lib/gossip";
import type { Rivalries } from "@/lib/relationships";
import { MIN_SHARED_GAMES } from "@/lib/relationships";
import { GossipLine, Superlative, recordLabel, winPct } from "./relationship-ui";

const COLS = "grid grid-cols-[1fr_3rem_4.5rem_3.5rem_3rem] gap-3 items-center";

// Who a player wins and loses against. Nemesis/favourite-victim callouts (gated
// by shared games) plus the full opponent table, each row linking to the H2H page.
export default function RivalriesCard({
  playerId,
  rivalries,
}: {
  playerId: string;
  rivalries: Rivalries;
}) {
  const { opponents, nemesis, favoriteVictim } = rivalries;
  const hook = rivalryHook(rivalries);

  return (
    <div className="card p-6">
      <p className="mono-label mb-1">Rivalries</p>
      {opponents.length === 0 ? (
        <p className="text-body-muted text-sm mt-3">No opponents recorded.</p>
      ) : (
        <>
          {hook ? (
            <div className="mb-4">
              <GossipLine>{hook}</GossipLine>
            </div>
          ) : null}
          {nemesis || favoriteVictim ? (
            <div className="grid grid-cols-2 gap-4 mb-5">
              {nemesis ? <Superlative label="Nemesis" record={nemesis} /> : null}
              {favoriteVictim ? <Superlative label="Favourite victim" record={favoriteVictim} /> : null}
            </div>
          ) : (
            <p className="text-body-muted text-sm mt-2 mb-4">
              Needs a decisive record over {MIN_SHARED_GAMES}+ games to name a rival.
            </p>
          )}

          <div className={`${COLS} py-2 border-b border-hairline mono-label`}>
            <span>Top opponents</span>
            <span className="text-right">GP</span>
            <span className="text-right">Record</span>
            <span className="text-right">Win%</span>
            <span className="text-right">H2H</span>
          </div>
          {opponents.slice(0, 3).map((o) => (
            <div key={o.id} className={`${COLS} py-2.5 border-b border-hairline text-sm`}>
              <Link href={`/players/${o.id}`} className="truncate text-ink hover:opacity-70" title={o.name}>
                {o.name}
              </Link>
              <span className="font-mono tabular-nums text-right">{o.games}</span>
              <span className="font-mono tabular-nums text-right">{recordLabel(o)}</span>
              <span className="font-mono tabular-nums text-right">{winPct(o)}</span>
              <Link
                href={`/players/${playerId}/vs/${o.id}`}
                className="text-right text-primary hover:opacity-70"
              >
                vs
              </Link>
            </div>
          ))}
          {opponents.length > 3 ? (
            <p className="text-body-muted text-xs mt-2">+{opponents.length - 3} more opponents</p>
          ) : null}
        </>
      )}
    </div>
  );
}
