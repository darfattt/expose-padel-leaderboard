# 2D 8-bit Padel Match Simulation — Design & Research

Status: design (branch `feature/2d-simulation`)

## Goal

On the head-to-head page, let the user watch a **2v2 pixel-art match**:

> **Player A + their pro lookalike** vs **Player B + their pro lookalike**

The cartoon must be *grounded*, not random:

- the **outcome follows the player attributes** and is calibrated to the site's own
  `predictMatchup()` win probability, so the arcade never contradicts the prediction bar;
- each character shows **named skills derived from their gear (racket) and the partner pro's style**;
- the pro characters are **recognisable** ("similar enough") via deterministic procedural pixel avatars.

## Decisions locked

| Area | Decision |
|---|---|
| Render tech | Vanilla `<canvas>` + `requestAnimationFrame` in a `"use client"` component. No new deps. |
| Placement | Embedded in the existing `/versus?a=&b=` page (reuses its pickers + prediction). |
| Pro avatars | Procedurally generated from pro identity (deterministic, scales to all 90 pros). |
| Outcome | Seeded rally sim **calibrated to `predictMatchup()`**. |

> Note: `next.config.mjs` aliases the **npm `canvas` package** to `false` (for pdfjs). That does
> **not** affect the browser `<canvas>` DOM element — vanilla canvas rendering works fine client-side.

## Data inputs (all already computed on read)

Everything needed exists on the `RankedPlayer` objects the `/versus` page already loads via
`getLeaderboard()` (`lib/leaderboard.ts:20`):

```ts
player.attributes   // { attack, defense, consistency, clutch, win } each 0..100  (lib/archetype.ts:5)
player.rating       // 0..7
player.archetype     // { key, primary, label, description }                       (lib/archetype.ts:21)
player.row.name
player.provisional
```

Pro lookalike (`lib/pros.ts`):

```ts
proCandidates(player.rating, player.archetype.primary).pros[0]  // top candidate = the "lookalike"
proPhoto(name) | proInitials(name) | proAvatarColor(name)
```

Win math (`lib/versus.ts:36`):

```ts
predictMatchup(ratingA, ratingB, { wins, games })  // → { probA, probB, ... }
```

Gear (`lib/types.ts:49`, `lib/racket-reco.ts`): `PlayerGear.racketName/Brand/Image` +
`racketPlayStyle()` → `power | control | balanced`. Gear is **optional** — sim must degrade
gracefully when a player has no racket set.

## Module layout

Keep all simulation logic **pure and framework-agnostic in `lib/`** (matches the codebase ethos:
testable, no React, no DB), and confine canvas/RAF to one client component.

```
lib/sim/
  rng.ts          # mulberry32 seeded PRNG (deterministic, shareable)
  team.ts         # RankedPlayer + pro → effective team stats + skills
  skills.ts       # gear + pro-style → named special moves
  avatar.ts       # pro identity → deterministic pixel-avatar spec (palette, stance, hair…)
  engine.ts       # pure rally/point/game simulation → MatchScript (timeline of events)
  engine.test.ts  # vitest: calibration + determinism + edge cases
app/versus/
  MatchSim.tsx    # "use client" canvas renderer; plays back a MatchScript
  page.tsx        # add a <MatchSim> section after the prediction bar
```

The split matters: `engine.ts` produces a **`MatchScript`** (a deterministic list of timed events —
serve, rally hit, winner, skill-trigger, point, score). The renderer is a *dumb player* of that
script. This makes the whole outcome unit-testable without a DOM, and lets us assert calibration.

## Attribute → gameplay mapping

The four meaningful axes (attack/defense are the same signal in fixed-sum games — see
`lib/archetype.ts:28`) map to rally mechanics:

| Attribute | Gameplay role |
|---|---|
| `attack` (power) | shot speed; smash/winner probability when on the attack |
| `consistency` | inverse unforced-error rate per exchange (low variance = fewer free points given) |
| `clutch` | multiplier applied on **big points** (deuce, set/match point, break point) |
| `win` | conversion — finishing a rally once ahead in it |

A team's **effective stats** blend the human player with the pro lookalike. The pro raises the floor
(they're rank-appropriate to the player's rating) and contributes a signature move:

```
teamStat = 0.7 * playerAttr + 0.3 * proFloor(proRank)
proFloor(rank) = scale rank 1..90 → ~100..55   // even the #90 pro is strong
```

(Weights are a starting point; tune in `team.ts`, cover with a test.)

## Outcome calibration to predictMatchup

The sim must *look* dramatic point-by-point but *expect* the same winner as the site.

1. Compute `target = predictMatchup(ratingA, ratingB, h2h).probA` (already done on the page).
2. In `engine.ts`, derive a **per-point win probability** `p` for team A such that a race to 21
   (or to the event's typical target) yields team A winning ≈ `target` of the time.
   - Closed form is fiddly; instead solve `p` numerically (bisection) so the simulated
     match-win rate over N seeds matches `target` within tolerance. Do this once at module build of
     the script, not per frame.
3. Attributes/skills/clutch **perturb `p` within a point** (rally drama) but the *integral* stays at
   `target`. This is the key invariant the test asserts:

```
expect(Math.abs(simulatedWinRate(seeded, 2000) - target)).toBeLessThan(0.04)
```

So: emergent rallies, calibrated result. Clutch shifts *which* points are dramatic, not the total.

## Skills from gear + partner pro ("show skills")

Each of the 4 characters surfaces 1–2 named moves, shown as labels that flash when triggered:

**From the racket (`racketPlayStyle`)**

| Frame | Skill | Effect in sim |
|---|---|---|
| power (diamond) | `Cannon Smash` | higher winner chance on attack points |
| control (round) | `Wall Defense` | higher retrieval → fewer points conceded |
| balanced (teardrop) | `All-Court` | small bonus to both |

**From the partner pro's archetype** (`archetype.primary` of the lookalike's band / player archetype)

| Primary | Signature |
|---|---|
| attack | `Vibora` |
| clutch | `Ice Bandeja` |
| consistency | `Metronome Lob` |
| win | `Closer Instinct` |
| balanced | `Smart Play` |

When a player has **no racket** set, only the pro signature shows. Skills are cosmetic-but-grounded:
each maps to a small, documented modifier in `skills.ts` so "results follow the gear/pro".

## Procedural pro pixel avatars ("similar enough")

The FIP dataset has only `rank`, `name`, `photo` — no nationality/handedness. So derive a
**deterministic avatar spec from the name** (same hashing approach as `proAvatarColor`,
`lib/pros.ts:122`):

```ts
interface AvatarSpec {
  skin: string;        // from a small skin palette, hash-selected
  hair: string;        // hair colour
  hairStyle: 0|1|2|3;  // short/cap/long/bald
  kit: string;         // jersey colour (reuse AVATAR_PALETTE)
  shorts: string;
  headband: boolean;
  stance: "L" | "R";   // lefty/righty, hash-derived
}
```

- 16×16 or 24×24 sprite drawn pixel-by-pixel on the canvas from the spec (no image assets needed).
- The pro's **name is labelled under the sprite** so resemblance is reinforced by identity, not just
  pixels. Optionally tint the kit from `proPhoto` later (photo-derived palette) — out of scope v1.
- Determinism means a given pro always looks identical across matches → recognisable.
- *Future enrichment*: a small hand-curated `name → { country, hand }` map for famous pros can
  override the hash (kit = flag colours, correct handedness) without changing the interface.

## Rendering (`MatchSim.tsx`)

- Side-on **8-bit court**: net in the middle, 2 players per side, ball as a 2–3px sprite.
- Game loop: `requestAnimationFrame`; integer-snapped positions + a small fixed palette for the
  retro look; `image-rendering: pixelated` on the canvas.
- Plays back the `MatchScript`: tween ball between hit positions, pop skill labels on trigger,
  update a pixel scoreboard, end on match point with a winner banner.
- Controls: Play / Pause / Replay / speed (1×/2×). Respect `prefers-reduced-motion` (offer an
  instant "skip to result" like the rest of the app disables chart animation).
- Reuses design tokens (deep-green = team A, coral = team B — consistent with the prediction bar and
  `CompareRadar`).

## Determinism & shareability

Seed the PRNG from a stable key: `hash(aId + bId + ratingsSnapshot)`. Same matchup → same match,
so a result is reproducible and a future "share this match" link is trivial. No `Date.now()` /
`Math.random()` in `lib/` (consistent with the pure-module convention).

## Build plan (incremental, each step independently testable)

1. `lib/sim/rng.ts` + `lib/sim/team.ts` (+ tests) — stats blend, pure.
2. `lib/sim/engine.ts` (+ test) — rally→match sim and the **calibration invariant** vs
   `predictMatchup`. This is the riskiest part; land it first.
3. `lib/sim/skills.ts` + `lib/sim/avatar.ts` (+ tests) — deterministic specs.
4. `app/versus/MatchSim.tsx` — canvas renderer playing back the script.
5. Wire into `app/versus/page.tsx` after the prediction bar; pass both `RankedPlayer`s, their top
   pro names, and gear.
6. Polish: skill flashes, scoreboard, reduced-motion fallback, replay/speed.

## Testing

- `engine.test.ts`: calibration tolerance, determinism (same seed → identical script), monotonicity
  (higher-rated team wins more), provisional/zero-game and equal-rating (50/50) edge cases.
- `team.test.ts` / `skills.test.ts` / `avatar.test.ts`: pure spec assertions.
- Renderer is intentionally logic-free (plays a script), so it needs no unit tests.

## Open questions for later (not blocking)

- Court view: side-on (chosen) vs top-down — revisit if side-on reads poorly for lobs.
- Match length: race to 21 vs the event's `points_per_game` basis — default 21 for the arcade.
- Curated pro country/handedness map for star players (fidelity upgrade).
