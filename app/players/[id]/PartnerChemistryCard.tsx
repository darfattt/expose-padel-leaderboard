import Link from "next/link";
import { partnerHook } from "@/lib/gossip";
import type { PartnerChemistry } from "@/lib/relationships";
import { MIN_SHARED_GAMES } from "@/lib/relationships";
import { GossipLine, Superlative, recordLabel, winPct } from "./relationship-ui";

const COLS = "grid grid-cols-[1fr_3rem_4.5rem_3.5rem] gap-3 items-center";

// Who a player wins with. Best/worst callouts (gated by shared games) plus the
// full partner table. Consumes data already computed from the player's history.
export default function PartnerChemistryCard({ chemistry }: { chemistry: PartnerChemistry }) {
  const { partners, best, worst } = chemistry;
  const hook = partnerHook(chemistry);

  return (
    <div className="card p-6">
      <p className="mono-label mb-1">Partner chemistry</p>
      {partners.length === 0 ? (
        <p className="text-body-muted text-sm mt-3">No partnered games recorded.</p>
      ) : (
        <>
          {hook ? (
            <div className="mb-4">
              <GossipLine>{hook}</GossipLine>
            </div>
          ) : null}
          {best || worst ? (
            <div className="grid grid-cols-2 gap-4 mb-5">
              {best ? <Superlative label="Best partner" record={best} /> : null}
              {worst ? <Superlative label="Worst partner" record={worst} /> : null}
            </div>
          ) : (
            <p className="text-body-muted text-sm mt-2 mb-4">
              Needs {MIN_SHARED_GAMES}+ games with a partner to call out chemistry.
            </p>
          )}

          <div className={`${COLS} py-2 border-b border-hairline mono-label`}>
            <span>Top partners</span>
            <span className="text-right">GP</span>
            <span className="text-right">Record</span>
            <span className="text-right">Win%</span>
          </div>
          {partners.slice(0, 3).map((p) => (
            <div key={p.id} className={`${COLS} py-2.5 border-b border-hairline text-sm`}>
              <Link href={`/players/${p.id}`} className="truncate text-ink hover:opacity-70" title={p.name}>
                {p.name}
              </Link>
              <span className="font-mono tabular-nums text-right">{p.games}</span>
              <span className="font-mono tabular-nums text-right">{recordLabel(p)}</span>
              <span className="font-mono tabular-nums text-right">{winPct(p)}</span>
            </div>
          ))}
          {partners.length > 3 ? (
            <p className="text-body-muted text-xs mt-2">+{partners.length - 3} more partners</p>
          ) : null}
        </>
      )}
    </div>
  );
}
