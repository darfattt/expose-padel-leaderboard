import Link from "next/link";
import { getRacketRating } from "@/app/actions/player";
import { type Achievement, type AchievementContext, computeAchievements } from "@/lib/achievements";
import { getLeaderboard, type RankedPlayer } from "@/lib/leaderboard";
import {
  getGearedPlayerIds,
  getPlayerGear,
  getPlayerMatchHistory,
  getPlayerReclub,
  type MatchHistoryEntry,
} from "@/lib/queries";
import { avatarFor } from "@/lib/reclub-avatar";
import { computeForm } from "@/lib/relationships";
import { FIELD_SIZE, pickOpponentIds, type TournamentEntry } from "@/lib/sim/tournament";
import type { PlayerGear } from "@/lib/types";
import TournamentArena from "./TournamentArena";

export const dynamic = "force-dynamic";

export default async function TournamentPage({
  searchParams,
}: {
  searchParams: Promise<{ you?: string; seed?: string }>;
}) {
  const { you: youId, seed: seedParam } = await searchParams;
  const board = await getLeaderboard();

  return (
    <div>
      <section className="mb-8">
        <p className="mono-label mb-4">Tournament</p>
        <h1 className="font-display text-[64px] leading-[0.95] tracking-tightest max-w-3xl">
          Pick yourself. Win the bracket.
        </h1>
        <p className="text-body-muted text-xs mt-5 max-w-xl">
          An 8-team knockout — sixteen players once every entrant is paired with their pro lookalike.
          You watch <span className="font-medium">your</span> match each round on the 2D court; the rest
          of the bracket resolves around you. Reach the final and it&apos;s best-of-three. Opponents are
          drawn from the field, geared players first — and any team without a racket dies the moment the
          ball is hit.
        </p>
      </section>

      <Picker board={board} youId={youId} />

      {board.length < FIELD_SIZE ? (
        <p className="text-body-muted mt-10 text-sm">
          A tournament needs at least {FIELD_SIZE} ranked players — there are only {board.length} so far.
          Upload more scoresheets to fill the bracket.
        </p>
      ) : youId ? (
        <Arena board={board} youId={youId} seed={parseSeed(seedParam)} />
      ) : (
        <p className="text-body-muted mt-10 text-sm">Choose yourself above to draw a bracket.</p>
      )}
    </div>
  );
}

function parseSeed(raw: string | undefined): number {
  const n = raw != null ? Number.parseInt(raw, 10) : NaN;
  if (Number.isFinite(n)) return n >>> 0;
  // No seed pinned in the URL → draw a *fresh, unpredictable* bracket on every
  // entry/refresh (a new field order and a new quarter-final opponent each time),
  // so the draw stays curious instead of replaying the same matchup. A "New draw"
  // or shared link carries an explicit ?seed=, which still replays identically.
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}

// Single-select GET form — "who are you?". Navigates to /tournament?you=<id>.
function Picker({ board, youId }: { board: RankedPlayer[]; youId?: string }) {
  const players = [...board].sort((p, q) => p.row.name.localeCompare(q.row.name));
  return (
    <form method="get" action="/tournament" className="flex flex-wrap items-end gap-3 border-y border-hairline py-5">
      <label className="flex flex-col gap-1">
        <span className="mono-label">You</span>
        <select
          name="you"
          defaultValue={youId ?? ""}
          className="min-w-[14rem] rounded-sm border border-hairline bg-canvas px-3 py-2 text-sm text-ink"
        >
          <option value="" disabled>
            Select yourself…
          </option>
          {players.map((p) => (
            <option key={p.row.player_id} value={p.row.player_id}>
              {p.row.name} · {p.rating.toFixed(1)}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" className="btn-primary">
        Enter tournament
      </button>
    </form>
  );
}

// Resolves the field server-side: validate "you", draw seven gear-first
// opponents, fetch every entrant's grounded facts, and hand the serialisable
// entries to the client arena.
async function Arena({ board, youId, seed }: { board: RankedPlayer[]; youId: string; seed: number }) {
  const you = board.find((p) => p.row.player_id === youId);
  if (!you) {
    return <p className="text-body-muted mt-10 text-sm">That player isn&apos;t on the leaderboard.</p>;
  }

  // You need a racket to step on court (same gate as Versus) — otherwise *you&apos;d*
  // be the one dying on every ball.
  const youGear = await getPlayerGear(youId);
  if (!youGear.racketName) {
    return (
      <div className="card mt-10 p-6">
        <p className="mono-label mb-1 text-coral">Set up your gear first</p>
        <p className="text-body-muted text-sm">
          You can&apos;t enter the tournament without a racket — pick one on your{" "}
          <Link href={`/players/${youId}`} className="text-ink underline hover:opacity-70">
            player page
          </Link>{" "}
          to take the court.
        </p>
      </div>
    );
  }

  // Geared players first when drawing opponents (deterministic per seed).
  const geared = await getGearedPlayerIds();
  const pool = board.map((p) => ({ id: p.row.player_id, hasGear: geared.has(p.row.player_id) }));
  const oppIds = pickOpponentIds(pool, youId, seed);
  const ids = [youId, ...oppIds];

  // Field context shared by the badge-morale signal.
  const rankedCount = board.filter((p) => p.rank != null).length;
  const ratingById = new Map(board.map((p) => [p.row.player_id, p.rating]));
  const topRankIds = new Set(
    board.filter((p) => p.rank != null && p.rank <= 3).map((p) => p.row.player_id)
  );

  const players = ids
    .map((id) => board.find((p) => p.row.player_id === id))
    .filter((p): p is RankedPlayer => p != null);

  // Resolve the eight entrants with limited concurrency. Each one may live-scrape
  // its Reclub profile for the player's photo (avatarFor → resolveReclubAvatar) on
  // a cold cache; firing all eight at once gets some throttled and silently
  // dropped to initials, so we cap the burst (Versus only ever resolves two).
  const entries = await mapWithConcurrency(players, 3, (p) =>
    buildEntry(p, { ratingById, topRankIds, rankedCount })
  );

  return <TournamentArena entries={entries} youId={youId} seed={seed} />;
}

// Run an async mapper over items with a bounded number in flight at once —
// keeps the Reclub avatar scrapes from bursting all at once (and getting
// rate-limited into initials) while staying far faster than fully sequential.
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

// Assemble one grounded TournamentEntry: identity + attributes plus the rich
// signals (gear, gear quality, form, badge morale, real photo) that tilt the
// simulated edge — mirroring the Versus tape's simPlayer.
async function buildEntry(
  player: RankedPlayer,
  field: { ratingById: Map<string, number>; topRankIds: Set<string>; rankedCount: number }
): Promise<TournamentEntry> {
  const id = player.row.player_id;
  const [matches, gear, reclub] = await Promise.all([
    getPlayerMatchHistory(id),
    getPlayerGear(id),
    getPlayerReclub(id),
  ]);
  const [avatarUrl, gearRating] = await Promise.all([
    avatarFor(reclub.url, reclub.avatarUrl),
    gear.racketSlug ? getRacketRating(gear.racketSlug) : Promise.resolve(null),
  ]);

  return {
    id,
    name: player.row.name,
    rating: player.rating,
    attributes: player.attributes,
    archetypePrimary: player.archetype.primary,
    hasRacket: Boolean(gear.racketName),
    racketName: gear.racketName,
    racketBrand: gear.racketBrand,
    gearRating,
    rank: player.rank,
    fieldSize: field.rankedCount,
    experienceGames: player.row.games,
    form: formWinRate(matches),
    morale: badgeMorale(player, matches, gear, field, Boolean(reclub.url)),
    gender: gear.gender,
    avatarUrl,
  };
}

function formWinRate(matches: MatchHistoryEntry[]): number {
  const form = computeForm(matches);
  if (!form.recent.length) return 0.5;
  return form.recent.filter((r) => r === "W").length / form.recent.length;
}

function badgeMorale(
  player: RankedPlayer,
  matches: MatchHistoryEntry[],
  gear: PlayerGear,
  field: { ratingById: Map<string, number>; topRankIds: Set<string>; rankedCount: number },
  reclubLinked: boolean
): number {
  const ctx: AchievementContext = {
    rank: player.rank,
    topRankIds: field.topRankIds,
    ratingById: field.ratingById,
    selfRating: player.rating,
    selfId: player.row.player_id,
    consistency: player.attributes.consistency,
    gear,
    reclubLinked,
  };
  const earned: Achievement[] = computeAchievements(player.row, matches, ctx).filter((a) => a.earned);
  const good = earned.filter((a) => a.tone === "good").length;
  const bad = earned.filter((a) => a.tone === "bad").length;
  return good - bad;
}
