// Suspense fallback shown while the LLM gossip line streams in. Mirrors the
// GossipCard shell (light coral callout) so the layout doesn't shift on swap.
export default function GossipCardSkeleton() {
  return (
    <div className="rounded-sm border border-coral-soft bg-[#fff5f2] px-4 py-3">
      <p className="mono-label text-coral mb-1.5">🍿 The Gossip</p>
      <p className="text-sm text-body-muted leading-relaxed animate-pulse">
        Digging up the dirt…
      </p>
    </div>
  );
}
