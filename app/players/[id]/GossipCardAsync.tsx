import { getOrCreateGossip } from "@/app/actions/gossip";
import { gossipEnabled } from "@/lib/gossip";
import GossipCard from "./GossipCard";

// Async server component: isolates the slow LLM gossip fetch behind a Suspense
// boundary so the rest of the player page renders immediately. Renders nothing
// when there's no summary (not enough relational data, or reports disabled with
// no cache) so the profile stays uncluttered.
export default async function GossipCardAsync({ playerId }: { playerId: string }) {
  const gossip = await getOrCreateGossip(playerId);
  if (!gossip) return null;
  return <GossipCard playerId={playerId} initial={gossip} enabled={gossipEnabled()} />;
}
