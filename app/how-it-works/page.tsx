import type { Metadata } from "next";
import Link from "next/link";
import { LEVELS, levelForRating } from "@/lib/levels";
import {
  MAX_RATING,
  MIN_GAMES_RANKED,
  RATING_WEIGHTS,
  RELIABILITY_TIERS,
} from "@/lib/rating";
import { DECAY_GRACE_DAYS, DECAY_MAX } from "@/lib/decay";
import DecayCurve from "./DecayCurve";

export const metadata: Metadata = {
  title: "How it works · padel leaderboard",
  description:
    "How points, ratings, reliability gates, levels, and rankings are calculated from your scoresheets.",
};

// A static, self-documenting methodology page. It imports the same constants the
// engine uses (weights, gates, level bands), so the numbers shown here can never
// drift from the real calculation.
export default function HowItWorksPage() {
  return (
    <div className="max-w-3xl">
      <p className="mono-label">Methodology</p>
      <h1 className="font-display text-[48px] sm:text-[56px] leading-none tracking-tightest mt-2">
        How ratings &amp; points are calculated
      </h1>
      <p className="text-body-muted mt-4 text-lg">
        The database stores only facts — who played whom and the score. Everything
        ranked or scored is recomputed in TypeScript on every page load, against
        the <em>whole current field</em>. Add players or upload an event and the
        whole board reshuffles.
      </p>

      {/* 1 · Points */}
      <Section tag="Step 1" title="From a scoresheet to points">
        <p>
          Each uploaded Reclub scoresheet is parsed into individual games. Every
          game a player appears in contributes a handful of raw facts:
        </p>
        <ul className="list-disc pl-5 space-y-1.5 marker:text-muted">
          <Li>
            <b>Points for / against</b> — the two scores in that game (games are
            played to 21, but any total works).
          </Li>
          <Li>
            <b>Result</b> — a win, loss, or draw.
          </Li>
          <Li>
            <b>Close game</b> — decided by a margin of 3 points or fewer. Winning
            these feeds the “clutch” attribute.
          </Li>
        </ul>
        <p>Those facts are rolled up into per-game rates, which is what the rating actually reads:</p>
        <div className="card divide-y divide-card-border mt-4">
          <DefRow term="Win rate" def="wins ÷ games played" />
          <DefRow term="Points per game (PPG)" def="total points scored ÷ games" />
          <DefRow term="Point differential / game" def="(points for − points against) ÷ games" />
        </div>
      </Section>

      {/* 2 · Rating */}
      <Section tag="Step 2" title={`The rating (0.0 – ${MAX_RATING.toFixed(1)})`}>
        <p>
          A player’s three rates are turned into{" "}
          <b>
            <abbr title="how many standard deviations above or below the field average">
              z-scores
            </abbr>
          </b>{" "}
          against the entire field — so the number is always relative to everyone
          else, not an absolute. The z-scores are blended with fixed weights:
        </p>
        <div className="card divide-y divide-card-border mt-4">
          <DefRow term="Win rate" def={`${pct(RATING_WEIGHTS.winRate)} of the blend`} />
          <DefRow term="Point differential / game" def={`${pct(RATING_WEIGHTS.diffPg)} of the blend`} />
          <DefRow term="Points per game" def={`${pct(RATING_WEIGHTS.ppg)} of the blend`} />
        </div>
        <p className="mt-4">
          The blended score is squashed through a smooth curve and stretched onto
          Playtomic’s <b>0–{MAX_RATING}</b> level scale (one decimal). An average,
          mid-field player lands around <b>3.5</b>; the scale is capped at{" "}
          {MAX_RATING.toFixed(1)}, the top of Playtomic’s ladder.
        </p>
        <Callout>
          A player’s rating is always computed against the full field, so the
          leaderboard and a profile page can never disagree.
        </Callout>
      </Section>

      {/* 3 · Reliability gates */}
      <Section tag="Step 3" title="Reliability gates">
        <p>
          Playtomic doesn’t trust a high level on a thin record — it tracks{" "}
          <b>reliability</b> (confidence that builds as you play). We make that
          concrete: to be rated <em>into</em> a band you have to clear that band’s
          bar on two earned totals — <b>net points</b> (everything you’ve scored
          minus everything you’ve conceded) and <b>wins</b>. Net points is the
          point: it weighs your scoring <em>against</em> what you give up, so
          conceding as much as you score earns nothing. Until you clear both, your
          rating is held just below the band.
        </p>
        <div className="overflow-x-auto mt-4">
          <table className="w-full text-sm min-w-[420px]">
            <thead>
              <tr className="mono-label text-left border-b border-hairline">
                <th className="py-2 font-normal">Band</th>
                <th className="py-2 font-normal text-right">Min net points</th>
                <th className="py-2 font-normal text-right">Min wins</th>
              </tr>
            </thead>
            <tbody>
              {RELIABILITY_TIERS.map((t) => {
                const band = levelForRating(t.level);
                return (
                  <tr key={t.level} className="border-b border-card-border">
                    <td className="py-2.5">
                      <span
                        className="level-chip"
                        style={{ color: band.color, borderColor: `${band.color}55`, backgroundColor: `${band.color}12` }}
                      >
                        <span aria-hidden>{band.badge}</span>
                        {band.category} {t.level.toFixed(1)}+
                      </span>
                    </td>
                    <td className="py-2.5 text-right font-mono tabular-nums">+{t.minScore}</td>
                    <td className="py-2.5 text-right font-mono tabular-nums">{t.minWins}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-body-muted text-sm">
          Gating starts at level 1.5 and the bars climb steeply — a strong event or
          two reaches the lower bands, but Elite and Professional need a season’s
          worth of net points and wins.
        </p>
        <p className="mt-3 text-body-muted text-sm">
          Your profile shows the exact gap to your next gate (e.g. “60 more net
          points and 4 more wins to unlock Competitor”) whenever reliability is
          what’s holding your rating down. A hot two-game streak can’t fake an
          Elite rating.
        </p>
      </Section>

      {/* 3b · Inactivity rust */}
      <Section tag="Step 3½" title="Inactivity rust">
        <p>
          Skill is what you&apos;ve proven; <b>freshness</b> is whether you&apos;ve shown up lately.
          A full <b>{DECAY_GRACE_DAYS}-day</b> grace window costs nothing — recreational players
          miss weeks. Past that, the live rating sheds a little each day (capped at{" "}
          <b>−{DECAY_MAX.toFixed(1)}</b>), so someone who stops playing slowly slides down the board
          until they return and knock the rust off. It never resets you to zero, and one event
          restores your full skill rating.
        </p>
        <div className="card p-4 sm:p-6 mt-4">
          <DecayCurve />
        </div>
      </Section>

      {/* 4 · Provisional */}
      <Section tag="Step 4" title="Provisional players">
        <p>
          Anyone with fewer than <b>{MIN_GAMES_RANKED} games</b> is{" "}
          <b>provisional</b>: their numbers are too noisy to trust, so they’re
          shown but left unranked and sorted to the bottom of the board until they
          cross the threshold.
        </p>
      </Section>

      {/* 5 · Levels */}
      <Section tag="Reference" title="The level ladder">
        <p>
          Every 0.5 of rating is its own named band, mapped onto Playtomic’s
          official level descriptions:
        </p>
        <div className="mt-4 space-y-px">
          {[...LEVELS].reverse().map((l) => (
            <div
              key={l.key}
              className="flex items-center gap-3 py-2.5 border-b border-card-border"
            >
              <span
                className="level-chip shrink-0 w-44"
                style={{ color: l.color, borderColor: `${l.color}55`, backgroundColor: `${l.color}12` }}
              >
                <span aria-hidden>{l.badge}</span>
                {l.category}
              </span>
              <span className="font-mono tabular-nums text-sm text-body-muted shrink-0 w-20">
                {l.min.toFixed(1)}–{l.max.toFixed(1)}
              </span>
              <span className="text-sm text-body-muted">{l.description}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* 6 · Ranking */}
      <Section tag="Step 5" title="Putting the board in order">
        <p>The leaderboard sorts everyone with at least one game by:</p>
        <ol className="list-decimal pl-5 space-y-1.5 marker:text-muted">
          <Li>Ranked players first, provisional players last.</Li>
          <Li>Then by <b>rating</b>, highest first.</Li>
          <Li>Ties broken by <b>win rate</b>, then by total <b>point differential</b>.</Li>
        </ol>
        <p className="mt-4 text-body-muted text-sm">
          Rank-change arrows on the all-time board compare the current standings
          against the standings before the most recent event.
        </p>
      </Section>

      <div className="mt-12 flex flex-wrap gap-4">
        <Link href="/" className="btn-primary">View the leaderboard</Link>
        <Link href="/upload" className="btn-secondary">Upload a scoresheet</Link>
      </div>
    </div>
  );
}

function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

function Section({
  tag,
  title,
  children,
}: {
  tag: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-14 border-t border-hairline pt-8">
      <p className="mono-label text-coral">{tag}</p>
      <h2 className="font-display text-[28px] tracking-tight mt-1 mb-4">{title}</h2>
      <div className="space-y-3 text-ink leading-relaxed">{children}</div>
    </section>
  );
}

function DefRow({ term, def }: { term: string; def: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 px-4 py-3">
      <span className="font-medium">{term}</span>
      <span className="text-body-muted text-sm font-mono">{def}</span>
    </div>
  );
}

function Callout({ children }: { children: React.ReactNode }) {
  return (
    <div className="card bg-pale-green/40 border-pale-green p-4 mt-4 text-sm text-deep-green">
      {children}
    </div>
  );
}

function Li({ children }: { children: React.ReactNode }) {
  return <li className="text-ink">{children}</li>;
}
