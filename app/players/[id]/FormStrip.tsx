import type { FormSummary } from "@/lib/relationships";
import { RESULT_TEXT, ResultPill } from "./relationship-ui";

// Compact recent-form display for the profile header: last games as pills (most
// recent first) plus the current streak and best-ever win streak.
export default function FormStrip({ form }: { form: FormSummary }) {
  if (!form.recent.length) return null;
  const streak = form.currentStreak;
  return (
    <div>
      <div className="mono-label mb-2">Form · recent first</div>
      <div className="flex items-center gap-1.5">
        {form.recent.map((r, i) => (
          <ResultPill key={i} result={r} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-1 mt-2 text-sm text-body-muted">
        {streak ? (
          <span>
            Streak{" "}
            <span className={`font-medium ${RESULT_TEXT[streak.result]}`}>
              {streak.length}
              {streak.result}
            </span>
          </span>
        ) : null}
        {form.longestWinStreak > 0 ? <span>Best win streak {form.longestWinStreak}</span> : null}
      </div>
    </div>
  );
}
