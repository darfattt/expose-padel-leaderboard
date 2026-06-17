# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Next.js dev server (App Router)
npm run build    # production build
npm run start    # serve the production build
npm run lint     # next lint
npm run test     # vitest run (one-shot)

npx vitest run lib/rating.test.ts          # a single test file
npx vitest run -t "computeRating"          # tests matching a name
npx vitest                                 # watch mode
```

Tests run in the Node environment (`vitest.config.ts`) and live next to the code they cover (`lib/*.test.ts`). The `@/*` path alias maps to the repo root (`tsconfig.json`), so imports use `@/lib/...`, `@/data/...`, etc.

## Environment

Nothing runs against real data without Supabase env vars. Every DB read is wrapped in try/catch returning `[]`/`null`, so pages render empty states when unconfigured — a build/dev session works without a database, it just shows nothing.

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — read path (anon client, RLS public SELECT).
- `SUPABASE_SERVICE_ROLE_KEY` — write path (service client, **server only**, bypasses RLS).
- `GROQ_API_KEY` — enables LLM Player Reports. `REPORTS_ENABLED=false` force-disables; `REPORT_MODEL` overrides the default (`llama-3.3-70b-versatile`).

Schema lives in `supabase/migrations/*.sql` — run them in the Supabase SQL editor or via `supabase db push`. `supabase/reset-data.sql` clears data.

## Architecture

A Next.js 15 / React 19 leaderboard for recreational padel "Mexicano/Americano" events. The data pipeline is: **upload a Reclub PDF scoresheet → parse to normalized matches → store raw results → derive all ratings/rankings/archetypes in TypeScript at read time**. The database stores only facts (who played whom, what the score was); everything ranked or scored is computed on every read, never persisted.

### Ingestion (PDF → DB)

1. `lib/parse-scoresheet.ts` — `extractPdfItems()` pulls positioned text fragments from the PDF via `pdfjs-dist` (legacy main-thread build; configured server-only in `next.config.mjs`). `parseItemsToScoresheet()` is the **pure, tested** core: it reconstructs round/court blocks from x/y geometry (court columns split on the "Court N" header x-position; names vs. scores distinguished by integer-ness) and parses event metadata (title, date, location, format, court/player counts) from the page-1 preamble. Keep this function pure — PDF extraction is deliberately separate so the parser is unit-testable (`parse-scoresheet.test.ts`).
2. `app/actions/upload.ts` — two Server Actions. `previewScoresheet()` parses + checks for duplicates without writing; `saveScoresheet()` **re-parses server-side** (never trusts the client) and inserts `event → players → matches → match_players`. Players are deduped by `normalizeName()` (`lib/normalize.ts`). Duplicate uploads are blocked by `content_hash` (an order-independent SHA-256 of the parsed payload, also in `lib/normalize.ts`). On any insert failure it deletes the event to roll back.

### Rating pipeline (DB → ranked players)

All read-time computation, layered and field-relative (a player's numbers are z-scored against the **whole current field**, so adding players reshuffles everyone):

- `player_career_stats` (SQL view) → `CareerStatRow` raw aggregates per player.
- `lib/stats.ts` — `computeMetrics()` turns a row into per-game rates; `fieldStats()`/`z()`/`scaleFromZ()` are the z-score + tanh-squash primitives everything else builds on.
- `lib/rating.ts` — `computeRating()` blends win-rate / point-diff / ppg z-scores (weights in `RATING_WEIGHTS`) into a score on Playtomic's 0.0–7.0 level scale (capped at `MAX_RATING` = 7; mid-field ≈ 3.5). **Reliability gates** (`RELIABILITY_TIERS` + `capForReliability`) hold a rating just below each band until the player clears that band's bar on two earned totals — **net points** (`minScore` = cumulative `point_diff`, points-for minus points-against) and **wins**. Net points (not raw points-for or games-played) is deliberate: it weighs scoring against what you concede, so conceding as much as you score earns nothing. Gating starts at 1.5 and climbs steeply (1.5: +60/4w, 2: +130/8w, 3: +240/15w, 4: +400/25w, 5: +620/40w, 6: +900/60w, 7: +1240/85w). This is our concrete take on Playtomic's "reliability" (high levels need a proven, dominant sample spanning a season, not a fixed match count), so a thin hot streak can't fake an Elite rating. Players under `MIN_GAMES_RANKED` (3) are **provisional** (unranked).
- `lib/levels.ts` — maps a 0–7 rating to a Playtomic level band in 0.5 steps (14 named bands Newcomer → Professional, each with category, emoji badge, accent color), worded from Playtomic's official level descriptions.
- `lib/archetype.ts` — `computeAttributes()` (5 display attributes 0–100) and `pickArchetype()`. Note the documented quirk: in fixed-sum games attack and defense carry identical signal, so archetype selection folds them into one "power" axis (`SELECT_AXES`) and picks from 4 independent axes → single or compound archetype labels.
- `lib/leaderboard.ts` — `rankPlayers()` is the orchestrator: builds the field normalization from everyone with ≥1 game, enriches each player (rating + attributes + archetype + provisional), then sorts and assigns ranks. `getLeaderboard()` / `getRankedPlayer()` are the entry points. **A single player's rating is always computed against the full field** (`getRankedPlayer` derives from the whole board) so a profile page and the leaderboard never disagree.

### LLM Player Reports

`lib/report.ts` + `app/actions/report.ts` generate a short "scouting report" per player via the Vercel AI SDK + Groq (`generateObject` with a Zod schema). Key constraints:

- The model is fed **only** a grounded fact sheet (`buildReportFacts`) and told to invent nothing.
- Pro-player comparisons are chosen from `lib/pros.ts`, which maps a player's rating → a rank window in `data/fip_men_ranking_top90.json` and rotates the slice by archetype. The model may only pick from this supplied candidate list (prevents hallucinated/ill-matched pros).
- Reports are **cached** in `player_reports` keyed by an `input_hash` (prompt version + model + facts). A cached row is served only while its hash matches current stats; otherwise it regenerates. Bump `PROMPT_VERSION` in `lib/report.ts` when changing the prompt/schema to invalidate caches.
- `lib/pros.ts` must stay free of server-only imports — it's shared with client components (`ReportCard`) for rendering pro photos/avatars.

### Routes & data access

App Router pages under `app/`: `/` (leaderboard), `/events` + `/events/[id]`, `/players/[id]` (profile with report card, radar, rating history), `/scatter`, `/upload`. Pages are Server Components that call helpers in `lib/queries.ts` (match history, events) and `lib/leaderboard.ts`. `lib/queries.ts` avoids N+1 by fetching participants in a second batched `.in(...)` query and grouping in memory. The report card streams in via a Suspense boundary (`ReportCardAsync` + skeleton/loader).

### Supabase clients

`lib/supabase/server.ts` exposes two clients — `createReadClient()` (anon, for reads) and `createServiceClient()` (service-role, server-only writes). Never use the service client from a Client Component or expose its key. Both throw if their env vars are missing; callers in `lib/` swallow that into empty results, but the upload actions surface it as a user-facing error.

## Conventions

- `lib/` is framework-agnostic and outside the Tailwind content glob — color values there are raw hex applied via inline `style`, not Tailwind classes (see `lib/levels.ts`).
- Styling follows the Cohere-inspired design system captured in `DESIGN.md` (restrained white/dark-green editorial look, pill CTAs, tight display type). Tailwind v3 (`tailwind.config.ts`).
- Writes go exclusively through validated Server Actions; the client never touches the DB directly.
