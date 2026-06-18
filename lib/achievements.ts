import { levelForRating } from "./levels";
import type { MatchHistoryEntry } from "./queries";
import { type RacketPlayStyle, shapeToStyle } from "./racket-reco";
import { MAX_RATING, reliabilityCap } from "./rating";
import { computeForm, opponentRecords, partnerChemistry, venueRecords } from "./relationships";
import type { RawResult } from "./standings";
import type { CareerStatRow, PlayerGear } from "./types";

// Career achievements / badges — lightweight gamification derived purely from a
// player's facts (career row + match history), with optional leaderboard context
// for the field-relative ones (giant killer, David, podium). Read-time only,
// like the rest of lib/; nothing is persisted.

// How far ahead an opponent must be rated for a win to count as a "David" upset.
export const DAVID_RATING_GAP = 1.4;
// Games needed in a single event before sweeping it counts as a clean sheet.
export const SWEEP_MIN_GAMES = 3;
// Margin of victory that counts as a blowout (Sharpshooter / Blown Out).
export const BLOWOUT_MARGIN = 10;
// Scoring fewer than this in a game earns the "Off Day" badge of shame.
export const LOW_SCORE = 5;
// Events needed before a never-dropping rating counts as a steady climb.
export const CLIMB_MIN_EVENTS = 3;
// Career-win milestone thresholds.
export const WIN_BRONZE = 25;
export const WIN_GOLD = 50;
export const WIN_LEGEND = 100;
// Career-points milestone thresholds.
export const POINTS_TARGET = 1000;
export const POINTS_TYCOON = 5000;
// Career net-points (point differential) milestone. The rating engine treats net
// points — not raw points-for — as the earned total that unlocks higher levels
// (see RELIABILITY_TIERS in lib/rating.ts), so we reward out-scoring opponents
// directly: this bar sits in the Controller gate's net-points range.
export const NET_POINTS_TARGET = 400;
// Games needed before a positive career differential is meaningful (not a thin,
// lucky sample). Mirrors the spirit of the reliability gates.
export const IN_THE_BLACK_MIN_GAMES = 10;
// High Roller: win rate over a meaningful sample.
export const HIGH_WIN_RATE = 0.7;
export const HIGH_WIN_RATE_MIN_GAMES = 20;
// Mr. Reliable: a high Consistency attribute (field-relative, 0–100) held over a
// meaningful number of games.
export const MR_RELIABLE_CONSISTENCY = 70;
export const MR_RELIABLE_MIN_GAMES = 10;
// Rating gained between first and latest event for Big Mover. On Playtomic's
// compressed 0–7 scale a full point is already a sizeable jump.
export const BIG_MOVER_GAIN = 1.0;
// Level bands (lib/levels.ts) that count as "reached Advanced" — Playtomic's
// ADVANCED tier and up, i.e. ratings of 5.5+.
const ADVANCED_LEVELS = new Set(["contender", "elite", "professional"]);
// Social / partnership thresholds.
export const DYNAMIC_DUO_WINS = 5; // wins with one partner
export const SOCIAL_BUTTERFLY_PARTNERS = 10; // distinct partners
export const GLOBETROTTER_VENUES = 3; // distinct venues
export const DOMINATION_WINS = 5; // wins over one opponent
// Shame thresholds.
export const HEARTBREAK_TARGET = 5; // close games lost
export const LOSS_STREAK_TARGET = 5; // consecutive losses (Cold Streak)
export const WOODEN_SPOON_MIN_PLAYERS = 4; // event size before "last" is meaningful
// Story thresholds.
export const COMEBACK_GAP_DAYS = 60; // absence before a return counts as a comeback
export const MARATHON_GAMES = 8; // games in a single event
// Events, venues & cadence thresholds.
export const VETERAN_EVENTS = 25; // events attended (a step beyond Regular's 10)
export const EVENT_CHAMPION_MIN_PLAYERS = 4; // event size before "winning it" is meaningful
export const HOME_TURF_WINS = 10; // wins at a single venue — your fortress
export const ROAD_WARRIOR_VENUES = 3; // distinct venues with at least one win
export const IRON_WEEK_DAYS = 7; // window for "two events inside a week"
export const WEEKLY_HABIT_WEEKS = 8; // distinct calendar weeks with a game played
// Gear rarity thresholds (field-relative racket badges). "Rare" / "popular" only
// mean something once a few people have actually set a racket.
export const GEAR_MIN_FIELD = 5; // players-with-rackets before rare/popular counts
export const GEAR_COMMON_MIN = 3; // users sharing the most popular racket to call it "common"

// --- Shame mirrors of the "good" badges -----------------------------------
// Each of these is the dark twin of a positive badge above and reuses the same
// data/helpers, so the badge wall reads as deliberately symmetric.
// Bridesmaid: finish runner-up (exactly one player out-scored you) this many
// times — the near-miss mirror of Event Champion.
export const BRIDESMAID_TARGET = 3;
// Sieve: concede this many career points — the leaky mirror of Point Machine.
export const SIEVE_TARGET = POINTS_TARGET;
// Glass Cannon: score freely yet still run a negative differential. A high
// points-for with a losing net diff — all offence, no defence.
export const GLASS_CANNON_MIN_POINTS = 500;
// Jekyll & Hyde: a low Consistency attribute held over a meaningful sample — the
// anti-Mr. Reliable. (Consistency is field-relative, 0–100; see archetype.ts.)
export const JEKYLL_CONSISTENCY = 35;
// Punching Bag: lose to one opponent this many times (mirror of Domination).
export const PUNCHING_BAG_LOSSES = DOMINATION_WINS;
// Stuck Together: lose this many games alongside one partner (mirror of Dynamic Duo).
export const STUCK_TOGETHER_LOSSES = DYNAMIC_DUO_WINS;
// Flat-Track Bully: enough career wins to be established, yet never once beaten an
// opponent rated above you — every scalp came from at/below your level. The inverse
// of David.
export const FLAT_TRACK_MIN_WINS = 15;

// Named "easter-egg" rivals — these badges are about specific people in the
// league. Matched by normalized name, so they no-op in leagues without them.
export const NAMED_NEMESIS = "Adhitia putra herawan"; // beat them in a match
export const NAMED_RANK_RIVAL = "Bang Econ"; // finish an event above them

// Local name key (mirrors normalizeName in lib/normalize.ts without pulling its
// node:crypto import in). Lowercased, trimmed, inner whitespace collapsed.
function nameKey(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, " ");
}

// A stable identity key for a racket model — prefers the catalogue slug, falls
// back to the normalized name. null when neither is set (nothing to compare).
function racketKey(r: { slug: string | null; name: string | null }): string | null {
  if (r.slug) return r.slug.toLowerCase().trim();
  if (r.name) return nameKey(r.name);
  return null;
}

export interface Achievement {
  key: string;
  name: string;
  badge: string; // emoji
  description: string;
  earned: boolean;
  tone: "good" | "bad"; // "bad" = a badge of shame, tinted differently
  // Present for count-based badges so the UI can show a progress bar. Omitted
  // for one-off (binary) badges. current is clamped to target.
  progress?: { current: number; target: number };
}

// Field-relative context, sourced from the global leaderboard. Optional: the
// achievements that need it are simply reported unearned when it's absent.
export interface AchievementContext {
  rank: number | null; // the player's current rank (null = provisional)
  topRankIds: Set<string>; // current top-3 player ids (Giant Killer target)
  ratingById: Map<string, number>; // rating per player (David comparison)
  selfRating: number;
  // Rating after each event, oldest first (for the steady-climb badge).
  ratingHistory?: number[];
  // The player's own id and every raw result in the field, so per-event
  // standings against a named rival can be reconstructed (Bang Econ badge).
  selfId?: string;
  results?: RawResult[];
  // The player's Consistency attribute (0–100, field-relative; see archetype.ts)
  // for the Mr. Reliable badge.
  consistency?: number;
  // The player's saved gear/position (racket + on-court side) for the gear badges.
  gear?: PlayerGear;
  // Every player's racket (this one included), so gear badges can compare across
  // the field: rarest racket, most popular, priciest. Identity fields (brand /
  // name / slug) drive the rarity badges; the optional shape / price catalogue
  // metadata light up the power / control / priciest badges when known. Omitted →
  // those badges simply don't appear.
  fieldRackets?: FieldRacket[];
  // This player's computed play style (power/control/balanced; see racket-reco).
  // Pairs with their racket's shape for the "made for you" style-match badge.
  playStyle?: RacketPlayStyle;
}

// One player's racket within the field-wide gear snapshot.
export interface FieldRacket {
  playerId: string;
  brand: string | null;
  name: string | null;
  slug: string | null;
  shape?: string | null; // catalogue shape, e.g. "Diamond" / "Round" / "Teardrop"
  price?: number | null; // catalogue price, for the Big Spender badge
}

function countBadge(
  key: string,
  badge: string,
  name: string,
  description: string,
  current: number,
  target: number,
  tone: "good" | "bad" = "good"
): Achievement {
  return {
    key,
    name,
    badge,
    description,
    earned: current >= target,
    tone,
    progress: { current: Math.min(current, target), target },
  };
}

// Largest margin in any won game (0 if no wins).
function biggestWinMargin(matches: MatchHistoryEntry[]): number {
  let best = 0;
  for (const m of matches) {
    if (m.result === "W") best = Math.max(best, m.points - m.conceded);
  }
  return best;
}

// True if the player won every game in some event with at least SWEEP_MIN_GAMES.
function hasEventSweep(matches: MatchHistoryEntry[]): boolean {
  const byEvent = new Map<string, MatchHistoryEntry[]>();
  for (const m of matches) {
    const list = byEvent.get(m.eventId) ?? [];
    list.push(m);
    byEvent.set(m.eventId, list);
  }
  for (const games of byEvent.values()) {
    if (games.length >= SWEEP_MIN_GAMES && games.every((g) => g.result === "W")) return true;
  }
  return false;
}

function beatTopThree(matches: MatchHistoryEntry[], ctx: AchievementContext): boolean {
  return matches.some((m) => m.result === "W" && m.opponentIds.some((id) => ctx.topRankIds.has(id)));
}

// A win over an opponent rated at least DAVID_RATING_GAP above the player.
function hasDavidWin(matches: MatchHistoryEntry[], ctx: AchievementContext): boolean {
  return matches.some((m) => {
    if (m.result !== "W") return false;
    const oppRatings = m.opponentIds.map((id) => ctx.ratingById.get(id)).filter((r): r is number => r !== undefined);
    return oppRatings.some((r) => r - ctx.selfRating >= DAVID_RATING_GAP);
  });
}

// Whether the player has ever beaten an opponent rated above them (any margin).
// The negation drives Flat-Track Bully.
function hasWinOverHigherRated(matches: MatchHistoryEntry[], ctx: AchievementContext): boolean {
  return matches.some(
    (m) =>
      m.result === "W" &&
      m.opponentIds.some((id) => {
        const r = ctx.ratingById.get(id);
        return r !== undefined && r > ctx.selfRating;
      })
  );
}

// Won a match where a named player was on the opposing side.
function beatNamedOpponent(matches: MatchHistoryEntry[], name: string): boolean {
  const target = nameKey(name);
  return matches.some((m) => m.result === "W" && m.opponents.some((o) => nameKey(o) === target));
}

// The fewest points the player scored in any single game (null if no games).
function lowestGameScore(matches: MatchHistoryEntry[]): number | null {
  if (!matches.length) return null;
  return matches.reduce((lo, m) => Math.min(lo, m.points), Infinity);
}

// Rating never dropped event-to-event and ended higher than it started, over a
// meaningful number of events.
function ratingSteadyClimb(history?: number[]): boolean {
  if (!history || history.length < CLIMB_MIN_EVENTS) return false;
  for (let i = 1; i < history.length; i++) {
    if (history[i] < history[i - 1]) return false;
  }
  return history[history.length - 1] > history[0];
}

// Rating never rose event-to-event and ended lower than it started, over a
// meaningful number of events — the mirror of ratingSteadyClimb.
function ratingSteadyDrop(history?: number[]): boolean {
  if (!history || history.length < CLIMB_MIN_EVENTS) return false;
  for (let i = 1; i < history.length; i++) {
    if (history[i] > history[i - 1]) return false;
  }
  return history[history.length - 1] < history[0];
}

// Games sorted oldest → newest (dated first, then by round/court). Undated games
// sort last. Used for streak/order-sensitive checks.
function chronoAsc(matches: MatchHistoryEntry[]): MatchHistoryEntry[] {
  return [...matches].sort((a, b) => {
    const d = (a.playedOn ?? "9999-99").localeCompare(b.playedOn ?? "9999-99");
    if (d !== 0) return d;
    return a.round - b.round || a.court - b.court;
  });
}

// Longest run of consecutive games with the given result, in chronological order.
function longestResultStreak(matches: MatchHistoryEntry[], target: "W" | "L" | "D"): number {
  let best = 0;
  let run = 0;
  for (const m of chronoAsc(matches)) {
    if (m.result === target) {
      run += 1;
      best = Math.max(best, run);
    } else {
      run = 0;
    }
  }
  return best;
}

// A win in which the player's team conceded nothing.
function hasShutoutWin(matches: MatchHistoryEntry[]): boolean {
  return matches.some((m) => m.result === "W" && m.conceded === 0);
}

// Lost a game by BLOWOUT_MARGIN or more.
function hasBlowoutLoss(matches: MatchHistoryEntry[]): boolean {
  return matches.some((m) => m.result === "L" && m.conceded - m.points >= BLOWOUT_MARGIN);
}

// Close games (margin ≤ 3) the player lost.
function closeLosses(matches: MatchHistoryEntry[]): number {
  return matches.filter((m) => m.result === "L" && Math.abs(m.points - m.conceded) <= 3).length;
}

// Most games the player played in any single event.
function maxGamesInEvent(matches: MatchHistoryEntry[]): number {
  const byEvent = new Map<string, number>();
  for (const m of matches) byEvent.set(m.eventId, (byEvent.get(m.eventId) ?? 0) + 1);
  let best = 0;
  for (const n of byEvent.values()) best = Math.max(best, n);
  return best;
}

// Beat an opponent who had beaten the player in an earlier game.
function hasRevengeWin(matches: MatchHistoryEntry[]): boolean {
  const lostTo = new Set<string>();
  for (const m of chronoAsc(matches)) {
    if (m.result === "W" && m.opponentIds.some((id) => lostTo.has(id))) return true;
    if (m.result === "L") m.opponentIds.forEach((id) => lostTo.add(id));
  }
  return false;
}

// Returned to play after an absence of COMEBACK_GAP_DAYS+ between two events.
function hasComebackGap(matches: MatchHistoryEntry[]): boolean {
  const days = [...new Set(matches.map((m) => m.playedOn).filter((d): d is string => !!d))].sort();
  for (let i = 1; i < days.length; i++) {
    const gap = (Date.parse(days[i]) - Date.parse(days[i - 1])) / 86_400_000;
    if (gap >= COMEBACK_GAP_DAYS) return true;
  }
  return false;
}

// Rating climbed by BIG_MOVER_GAIN+ from the first event to the latest.
function isBigMover(history?: number[]): boolean {
  if (!history || history.length < 2) return false;
  return history[history.length - 1] - history[0] >= BIG_MOVER_GAIN;
}

// Rating fell BIG_MOVER_GAIN+ from its peak to the latest event — the slide
// mirror of Big Mover.
function isBigFaller(history?: number[]): boolean {
  if (!history || history.length < 2) return false;
  const peak = Math.max(...history);
  return peak - history[history.length - 1] >= BIG_MOVER_GAIN;
}

// Finished bottom on points in an event with enough players for "last" to mean
// something (no one scored fewer than the player; ties at the bottom count).
function hasWoodenSpoon(ctx: AchievementContext): boolean {
  if (!ctx.results || !ctx.selfId) return false;
  const byEvent = new Map<string, Map<string, number>>();
  for (const r of ctx.results) {
    let totals = byEvent.get(r.eventId);
    if (!totals) {
      totals = new Map();
      byEvent.set(r.eventId, totals);
    }
    totals.set(r.playerId, (totals.get(r.playerId) ?? 0) + r.points);
  }
  for (const totals of byEvent.values()) {
    const mine = totals.get(ctx.selfId);
    if (mine === undefined || totals.size < WOODEN_SPOON_MIN_PLAYERS) continue;
    let last = true;
    for (const [pid, pts] of totals) {
      if (pid !== ctx.selfId && pts < mine) {
        last = false;
        break;
      }
    }
    if (last) return true;
  }
  return false;
}

// Won an event outright: finished top on total points in an event with enough
// players for "winning it" to mean something. Ties at the top still count (shared
// first place). The mirror image of hasWoodenSpoon.
function hasEventWin(ctx: AchievementContext): boolean {
  if (!ctx.results || !ctx.selfId) return false;
  const byEvent = new Map<string, Map<string, number>>();
  for (const r of ctx.results) {
    let totals = byEvent.get(r.eventId);
    if (!totals) {
      totals = new Map();
      byEvent.set(r.eventId, totals);
    }
    totals.set(r.playerId, (totals.get(r.playerId) ?? 0) + r.points);
  }
  for (const totals of byEvent.values()) {
    const mine = totals.get(ctx.selfId);
    if (mine === undefined || totals.size < EVENT_CHAMPION_MIN_PLAYERS) continue;
    let top = true;
    for (const [pid, pts] of totals) {
      if (pid !== ctx.selfId && pts > mine) {
        top = false;
        break;
      }
    }
    if (top) return true;
  }
  return false;
}

// How many events the player finished as runner-up: exactly one other player
// out-scored them on total points, in an event big enough for placing to mean
// something. The near-miss mirror of hasEventWin (which needs zero above you).
function runnerUpCount(ctx: AchievementContext): number {
  if (!ctx.results || !ctx.selfId) return 0;
  const byEvent = new Map<string, Map<string, number>>();
  for (const r of ctx.results) {
    let totals = byEvent.get(r.eventId);
    if (!totals) {
      totals = new Map();
      byEvent.set(r.eventId, totals);
    }
    totals.set(r.playerId, (totals.get(r.playerId) ?? 0) + r.points);
  }
  let count = 0;
  for (const totals of byEvent.values()) {
    const mine = totals.get(ctx.selfId);
    if (mine === undefined || totals.size < EVENT_CHAMPION_MIN_PLAYERS) continue;
    let above = 0;
    for (const [pid, pts] of totals) {
      if (pid !== ctx.selfId && pts > mine) above += 1;
    }
    if (above === 1) count += 1;
  }
  return count;
}

// The day-number (days since the Unix epoch, UTC) of a yyyy-mm-dd date, or null
// when missing/unparseable. A stable integer key for week/window arithmetic.
function dayNumber(date: string | null): number | null {
  if (!date) return null;
  const t = Date.parse(date);
  if (Number.isNaN(t)) return null;
  return Math.floor(t / 86_400_000);
}

// Played two or more distinct events within any IRON_WEEK_DAYS window. Events are
// reduced to their earliest dated game; the closest pair of event dates is an
// adjacent pair once sorted, so an adjacency scan finds the tightest week.
function hasBusyWeek(matches: MatchHistoryEntry[]): boolean {
  const eventDay = new Map<string, number>();
  for (const m of matches) {
    const day = dayNumber(m.playedOn);
    if (day === null) continue;
    const prev = eventDay.get(m.eventId);
    if (prev === undefined || day < prev) eventDay.set(m.eventId, day);
  }
  const days = [...eventDay.values()].sort((a, b) => a - b);
  for (let i = 1; i < days.length; i++) {
    if (days[i] - days[i - 1] <= IRON_WEEK_DAYS) return true;
  }
  return false;
}

// Number of distinct ISO (Monday-based) calendar weeks the player has a dated
// game in — a measure of how regularly, week to week, they show up.
function distinctWeeks(matches: MatchHistoryEntry[]): number {
  const weeks = new Set<number>();
  for (const m of matches) {
    const day = dayNumber(m.playedOn);
    if (day === null) continue;
    const dow = (new Date(day * 86_400_000).getUTCDay() + 6) % 7; // Mon=0 … Sun=6
    weeks.add(day - dow); // day-number of that week's Monday
  }
  return weeks.size;
}

// Finished above a named rival on total points in at least one shared event.
// In Mexicano/Americano an event's standing is its points total, so out-scoring
// the rival across an event means finishing above them.
function outplacedNamedRival(ctx: AchievementContext, rivalName: string): boolean {
  if (!ctx.results || !ctx.selfId) return false;
  const target = nameKey(rivalName);
  const selfByEvent = new Map<string, number>();
  const rivalByEvent = new Map<string, number>();
  for (const r of ctx.results) {
    if (r.playerId === ctx.selfId) {
      selfByEvent.set(r.eventId, (selfByEvent.get(r.eventId) ?? 0) + r.points);
    } else if (nameKey(r.name) === target) {
      rivalByEvent.set(r.eventId, (rivalByEvent.get(r.eventId) ?? 0) + r.points);
    }
  }
  for (const [eventId, mine] of selfByEvent) {
    const theirs = rivalByEvent.get(eventId);
    if (theirs !== undefined && mine > theirs) return true;
  }
  return false;
}

// Compute the full achievement catalog for a player, earned flags filled in.
// Always returns every badge (earned and locked) in a stable order so the UI can
// show progress toward the locked ones.
export function computeAchievements(
  row: CareerStatRow,
  matches: MatchHistoryEntry[],
  ctx?: AchievementContext
): Achievement[] {
  const events = new Set(matches.map((m) => m.eventId)).size;
  const longestWinStreak = computeForm(matches).longestWinStreak;
  const lowScore = lowestGameScore(matches);
  const partners = partnerChemistry(matches).partners;
  const opponents = opponentRecords(matches);
  const venueRecs = venueRecords(matches);
  const venues = venueRecs.length;
  const venuesWon = venueRecs.filter((v) => v.wins >= 1).length;
  const weeks = distinctWeeks(matches);
  const advanced = ctx ? ADVANCED_LEVELS.has(levelForRating(ctx.selfRating).key) : false;

  // --- Gear rarity & spec, all relative to the rest of the field ------------
  const field = ctx?.fieldRackets ?? [];
  const selfRacketEntry = ctx?.selfId ? field.find((g) => g.playerId === ctx.selfId) ?? null : null;
  const selfKey = ctx?.gear
    ? racketKey({ slug: ctx.gear.racketSlug, name: ctx.gear.racketName })
    : selfRacketEntry
      ? racketKey(selfRacketEntry)
      : null;

  // How many players (incl. this one) wield each racket model.
  const racketCounts = new Map<string, number>();
  for (const g of field) {
    const k = racketKey(g);
    if (k) racketCounts.set(k, (racketCounts.get(k) ?? 0) + 1);
  }
  const fieldSize = field.length;
  const selfCount = selfKey ? racketCounts.get(selfKey) ?? 0 : 0;
  const topCount = racketCounts.size ? Math.max(...racketCounts.values()) : 0;
  // The only one swinging it (and a real field to stand out from).
  const uniqueGear = !!selfKey && selfCount === 1 && fieldSize >= GEAR_MIN_FIELD;
  // Swinging the most popular frame, shared by a meaningful crowd.
  const commonGear =
    !!selfKey && selfCount === topCount && topCount >= GEAR_COMMON_MIN && fieldSize >= GEAR_MIN_FIELD;

  // Spec-based badges need catalogue metadata (shape / price). They're emitted
  // only when that data is present, so we never show a permanently-locked badge.
  const selfShape = selfRacketEntry?.shape ?? null;
  const selfStyle = shapeToStyle(selfShape);
  const fieldPrices = field
    .map((g) => g.price)
    .filter((p): p is number => typeof p === "number" && p > 0);
  const selfPrice = selfRacketEntry?.price ?? null;
  const priciest =
    selfPrice != null && selfPrice > 0 && fieldPrices.length > 0 && selfPrice >= Math.max(...fieldPrices);

  const binary = (
    key: string,
    badge: string,
    name: string,
    description: string,
    earned: boolean,
    tone: "good" | "bad" = "good"
  ): Achievement => ({ key, name, badge, description, earned, tone });

  const list: Achievement[] = [
    // --- Volume / loyalty ---------------------------------------------------
    countBadge("half-century", "🏆", "Half Century", "Play 50 career games.", row.games, 50),
    countBadge("centurion", "💯", "Centurion", "Play 100 career games.", row.games, 100),
    countBadge("regular", "📅", "Regular", "Show up to 10 events.", events, 10),
    countBadge("veteran", "🎟️", "Veteran", `Show up to ${VETERAN_EVENTS} events.`, events, VETERAN_EVENTS),
    countBadge("winner", "🏅", "Winner", `Win ${WIN_BRONZE} career games.`, row.wins, WIN_BRONZE),
    countBadge("champion", "👑", "Champion", `Win ${WIN_GOLD} career games.`, row.wins, WIN_GOLD),
    countBadge("legend", "🐐", "Legend", `Win ${WIN_LEGEND} career games.`, row.wins, WIN_LEGEND),
    countBadge("point-machine", "💰", "Point Machine", `Score ${POINTS_TARGET} career points.`, row.points_for, POINTS_TARGET),
    countBadge("point-tycoon", "🤑", "Point Tycoon", `Score ${POINTS_TYCOON} career points.`, row.points_for, POINTS_TYCOON),
    // --- Net points & reliability (the rating engine's earned totals) -------
    binary(
      "in-the-black",
      "🟢",
      "In the Black",
      `Keep a positive net point differential over ${IN_THE_BLACK_MIN_GAMES}+ games.`,
      row.games >= IN_THE_BLACK_MIN_GAMES && row.point_diff > 0
    ),
    countBadge(
      "margin-merchant",
      "💹",
      "Margin Merchant",
      `Bank +${NET_POINTS_TARGET} career net points (scored minus conceded).`,
      Math.max(0, row.point_diff),
      NET_POINTS_TARGET
    ),
    binary(
      "certified",
      "🎓",
      "Certified",
      "Clear every reliability gate — prove out the full 0–7 ladder.",
      // Normalized net points (lib/scoring.ts) so this matches the rating's gate.
      reliabilityCap({ score: row.norm_point_diff ?? row.point_diff, wins: row.wins }) >= MAX_RATING
    ),
    // --- Streaks & skill ----------------------------------------------------
    countBadge("hot-streak", "🔥", "Hot Streak", "Win 5 games in a row.", longestWinStreak, 5),
    countBadge("on-fire", "🌋", "On Fire", "Win 10 games in a row.", longestWinStreak, 10),
    countBadge("clutch", "❄️", "Ice Cold", "Win 10 close games (≤3 pts).", row.close_wins, 10),
    binary(
      "sharpshooter",
      "🎯",
      "Sharpshooter",
      `Win a game by ${BLOWOUT_MARGIN}+ points.`,
      biggestWinMargin(matches) >= BLOWOUT_MARGIN
    ),
    binary("clean-sheet", "🧤", "Clean Sheet", "Win a game conceding 0.", hasShutoutWin(matches)),
    binary("unbeaten", "🛡️", "Unbeaten Night", "Win every game in an event.", hasEventSweep(matches)),
    binary(
      "high-roller",
      "📊",
      "High Roller",
      `Hold a ${Math.round(HIGH_WIN_RATE * 100)}% win rate over ${HIGH_WIN_RATE_MIN_GAMES}+ games.`,
      row.games >= HIGH_WIN_RATE_MIN_GAMES && row.wins / row.games >= HIGH_WIN_RATE
    ),
    binary(
      "mr-reliable",
      "🧱",
      "Mr. Reliable",
      `Stay highly consistent over ${MR_RELIABLE_MIN_GAMES}+ games.`,
      ctx?.consistency != null && ctx.consistency >= MR_RELIABLE_CONSISTENCY && row.games >= MR_RELIABLE_MIN_GAMES
    ),
    // --- Rank & rating ------------------------------------------------------
    binary("podium", "🥇", "Podium", "Sit in the current top 3.", ctx?.rank != null && ctx.rank <= 3),
    binary("apex", "🔝", "Apex", "Reach #1 on the leaderboard.", ctx?.rank === 1),
    binary("level-up", "🎖️", "Level Up", "Reach Advanced level or above.", advanced),
    binary(
      "on-the-up",
      "📈",
      "On the Up",
      `Never drop your rating across ${CLIMB_MIN_EVENTS}+ events.`,
      ratingSteadyClimb(ctx?.ratingHistory)
    ),
    binary("big-mover", "🚀", "Big Mover", `Climb ${BIG_MOVER_GAIN}+ rating from your first event.`, isBigMover(ctx?.ratingHistory)),
    // --- Skill vs the field -------------------------------------------------
    binary(
      "giant-killer",
      "🗡️",
      "Giant Killer",
      "Beat a top-3 ranked player.",
      ctx ? beatTopThree(matches, ctx) : false
    ),
    binary(
      "david",
      "🪨",
      "David",
      `Beat an opponent rated ${DAVID_RATING_GAP.toFixed(1)}+ above you.`,
      ctx ? hasDavidWin(matches, ctx) : false
    ),
    binary("revenge", "🔁", "Revenge", "Beat someone who had beaten you before.", hasRevengeWin(matches)),
    // --- Social / partnerships ----------------------------------------------
    countBadge(
      "social-butterfly",
      "🦋",
      "Social Butterfly",
      `Partner with ${SOCIAL_BUTTERFLY_PARTNERS} different players.`,
      partners.length,
      SOCIAL_BUTTERFLY_PARTNERS
    ),
    binary(
      "dynamic-duo",
      "🤝",
      "Dynamic Duo",
      `Win ${DYNAMIC_DUO_WINS} games with one partner.`,
      partners.some((p) => p.wins >= DYNAMIC_DUO_WINS)
    ),
    countBadge("globetrotter", "🌍", "Globetrotter", `Play at ${GLOBETROTTER_VENUES} different venues.`, venues, GLOBETROTTER_VENUES),
    binary(
      "domination",
      "😈",
      "Domination",
      `Beat the same opponent ${DOMINATION_WINS} times.`,
      opponents.some((o) => o.wins >= DOMINATION_WINS)
    ),
    // --- Events, venues & cadence -------------------------------------------
    binary(
      "event-champion",
      "🏟️",
      "Event Champion",
      "Top the points table to win an event.",
      ctx ? hasEventWin(ctx) : false
    ),
    binary(
      "home-turf",
      "🏠",
      "Home Turf",
      `Win ${HOME_TURF_WINS} games at a single venue.`,
      venueRecs.some((v) => v.wins >= HOME_TURF_WINS)
    ),
    countBadge(
      "road-warrior",
      "🗺️",
      "Road Warrior",
      `Win a game at ${ROAD_WARRIOR_VENUES} different venues.`,
      venuesWon,
      ROAD_WARRIOR_VENUES
    ),
    binary(
      "iron-week",
      "⚡",
      "Iron Week",
      `Play two events within ${IRON_WEEK_DAYS} days.`,
      hasBusyWeek(matches)
    ),
    countBadge(
      "weekly-habit",
      "🗓️",
      "Weekly Habit",
      `Play in ${WEEKLY_HABIT_WEEKS} different calendar weeks.`,
      weeks,
      WEEKLY_HABIT_WEEKS
    ),
    // --- Gear & setup -------------------------------------------------------
    binary("geared-up", "🎒", "Geared Up", "Register your racket in your profile.", !!ctx?.gear?.racketSlug),
    binary("take-your-side", "🧭", "Take Your Side", "Set your on-court position.", !!ctx?.gear?.position),
    binary("switch-hitter", "🔀", "Switch Hitter", "Mark yourself comfortable on either side.", ctx?.gear?.position === "Both"),
    binary(
      "fully-kitted",
      "🎽",
      "Fully Kitted",
      "Complete your profile — racket and position both set.",
      !!ctx?.gear?.racketSlug && !!ctx?.gear?.position
    ),
    // --- Gear vs the field --------------------------------------------------
    binary("one-of-a-kind", "🦄", "One of a Kind", "Wield a racket no one else in the league uses.", uniqueGear),
    binary("crowd-favourite", "👥", "Crowd Favourite", "Swing the league's most popular racket.", commonGear),
    // --- Story ---------------------------------------------------------------
    binary("marathoner", "🏃", "Marathoner", `Play ${MARATHON_GAMES}+ games in one event.`, maxGamesInEvent(matches) >= MARATHON_GAMES),
    binary("comeback-kid", "🔙", "Comeback Kid", `Return after ${COMEBACK_GAP_DAYS}+ days away.`, hasComebackGap(matches)),
    // --- Named "easter-egg" rivalries — specific to this league -------------
    binary("nemesis-slayer", "⚔️", "Nemesis Slayer", `Beat ${NAMED_NEMESIS} in a match.`, beatNamedOpponent(matches, NAMED_NEMESIS)),
    binary(
      "econ-beater",
      "🆙",
      "Better Than Econ",
      `Finish an event above ${NAMED_RANK_RIVAL}.`,
      ctx ? outplacedNamedRival(ctx, NAMED_RANK_RIVAL) : false
    ),
    // --- Badges of shame — earned by misfortune, worn with pride -----------
    binary("off-day", "🥶", "Off Day", `Score under ${LOW_SCORE} in a game.`, lowScore !== null && lowScore < LOW_SCORE, "bad"),
    binary("donut", "🍩", "Donut", "Score 0 in a game.", lowScore === 0, "bad"),
    binary("blown-out", "💥", "Blown Out", `Lose a game by ${BLOWOUT_MARGIN}+ points.`, hasBlowoutLoss(matches), "bad"),
    countBadge("heartbreaker", "💔", "Heartbreaker", "Lose 5 close games (≤3 pts).", closeLosses(matches), HEARTBREAK_TARGET, "bad"),
    countBadge("cold-streak", "🧊", "Cold Streak", "Lose 5 games in a row.", longestResultStreak(matches, "L"), LOSS_STREAK_TARGET, "bad"),
    binary("wooden-spoon", "🥄", "Wooden Spoon", "Finish last in an event.", ctx ? hasWoodenSpoon(ctx) : false, "bad"),
    // --- Shame mirrors of the good badges (same data, dark twin) -----------
    countBadge(
      "bridesmaid",
      "🥈",
      "Bridesmaid",
      `Finish runner-up in ${BRIDESMAID_TARGET} events.`,
      ctx ? runnerUpCount(ctx) : 0,
      BRIDESMAID_TARGET,
      "bad"
    ),
    countBadge(
      "sieve",
      "🧽",
      "Sieve",
      `Concede ${SIEVE_TARGET} career points.`,
      row.points_against,
      SIEVE_TARGET,
      "bad"
    ),
    binary(
      "glass-cannon",
      "🩸",
      "Glass Cannon",
      `Score ${GLASS_CANNON_MIN_POINTS}+ points but still finish in the red.`,
      row.points_for >= GLASS_CANNON_MIN_POINTS && row.point_diff < 0,
      "bad"
    ),
    binary(
      "jekyll-and-hyde",
      "🎭",
      "Jekyll & Hyde",
      `Stay wildly inconsistent over ${MR_RELIABLE_MIN_GAMES}+ games.`,
      ctx?.consistency != null && ctx.consistency <= JEKYLL_CONSISTENCY && row.games >= MR_RELIABLE_MIN_GAMES,
      "bad"
    ),
    binary(
      "punching-bag",
      "🥊",
      "Punching Bag",
      `Lose to the same opponent ${PUNCHING_BAG_LOSSES} times.`,
      opponents.some((o) => o.losses >= PUNCHING_BAG_LOSSES),
      "bad"
    ),
    binary(
      "stuck-together",
      "🔗",
      "Stuck Together",
      `Lose ${STUCK_TOGETHER_LOSSES} games alongside one partner.`,
      partners.some((p) => p.losses >= STUCK_TOGETHER_LOSSES),
      "bad"
    ),
    binary(
      "free-fall",
      "📉",
      "Free Fall",
      `Drop your rating every event across ${CLIMB_MIN_EVENTS}+ events.`,
      ratingSteadyDrop(ctx?.ratingHistory),
      "bad"
    ),
    binary(
      "slipping",
      "🪂",
      "Slipping",
      `Slide ${BIG_MOVER_GAIN.toFixed(1)}+ rating from your peak.`,
      isBigFaller(ctx?.ratingHistory),
      "bad"
    ),
    binary(
      "flat-track-bully",
      "🃏",
      "Flat-Track Bully",
      `Win ${FLAT_TRACK_MIN_WINS}+ games but never beat anyone rated above you.`,
      ctx ? row.wins >= FLAT_TRACK_MIN_WINS && !hasWinOverHigherRated(matches, ctx) : false,
      "bad"
    ),
  ];

  // Spec-based gear badges — only surfaced when the racket catalogue metadata
  // (shape / price) needed to judge them is available, so the catalog never
  // carries a badge that can't possibly be earned. Inserted just after the
  // identity gear badges to keep the gear group together.
  const specBadges: Achievement[] = [];
  if (selfStyle === "power")
    specBadges.push(binary("power-frame", "💪", "Power Frame", "Gear up with a power-shaped (diamond) racket.", true));
  if (selfStyle === "control")
    specBadges.push(binary("control-frame", "🪶", "Control Frame", "Gear up with a control-shaped (round) racket.", true));
  if (selfStyle && ctx?.playStyle)
    specBadges.push(
      binary(
        "made-for-you",
        "🪞",
        "Made for You",
        "Your racket's style matches how you actually play.",
        selfStyle === ctx.playStyle
      )
    );
  if (selfPrice != null && fieldPrices.length > 0)
    specBadges.push(binary("big-spender", "💸", "Big Spender", "Own the priciest racket in the league.", priciest));

  if (specBadges.length) {
    const at = list.findIndex((a) => a.key === "crowd-favourite");
    list.splice(at + 1, 0, ...specBadges);
  }

  return list;
}
