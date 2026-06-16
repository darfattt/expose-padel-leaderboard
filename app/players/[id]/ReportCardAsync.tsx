import { getOrCreatePlayerReport } from "@/app/actions/report";
import { reportsEnabled } from "@/lib/report";
import ReportCard from "./ReportCard";

// Async server component: isolates the slow LLM report fetch behind a Suspense
// boundary so the rest of the player page renders immediately.
export default async function ReportCardAsync({ playerId }: { playerId: string }) {
  const report = await getOrCreatePlayerReport(playerId);
  return <ReportCard playerId={playerId} initial={report} enabled={reportsEnabled()} />;
}
