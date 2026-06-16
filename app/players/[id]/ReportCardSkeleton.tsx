import PadelBallLoader from "./PadelBallLoader";

// Suspense fallback shown while the Player Report streams in. Mirrors the
// ReportCard shell (deep-green card) so the layout doesn't shift on swap.
export default function ReportCardSkeleton() {
  return (
    <div className="card p-6 bg-deep-green text-white border-deep-green">
      <p className="mono-label text-white/60 mb-3">Player Report</p>
      <PadelBallLoader label="Generating Player Report…" />
    </div>
  );
}
