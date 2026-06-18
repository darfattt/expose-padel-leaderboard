"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import PlayerAvatar from "@/app/components/PlayerAvatar";
import { buildMatchScript, type MatchScript } from "@/lib/sim/engine";
import type { TeamSpec } from "@/lib/sim/team";
import { drawAvatar } from "./avatar-sprite";

// Dumb player of a MatchScript. All outcome logic lives in lib/sim/engine.ts
// (pure, tested). This component is cosmetic only: it tweens the ball, runs the
// four players to it and back, pops skill labels, narrates a live commentary
// feed, updates a pixel scoreboard, and synthesizes retro blips via the Web
// Audio API (no asset files). Vanilla <canvas> + RAF, no deps. Never autoplays —
// the match runs only after the user clicks Play.
//
// NOTE: next.config.mjs aliases the npm `canvas` package to false (for pdfjs).
// That's a Node module alias — it does not touch the browser <canvas> DOM
// element or the Web Audio API, which is what we use here. Renders fine on Vercel.

// Logical canvas size (scaled up by devicePixelRatio for crispness). 16:9.
const W = 480;
const H = 270;

// Court inset (the surround/run-back sits in this margin).
const PAD_X = 30;
const PAD_TOP = 50;
const PAD_BOTTOM = 26;

// Padel court markings (normalized 0..1 along court length). Two service lines
// parallel to the centre net, joined by a centre service line — matching a real
// top-down court.
const NET_X = 0.5;
const SERVICE_X = [0.3, 0.7];

// Palette — a real padel court (steel-blue surround, dark slate playing area).
const C_SURROUND = "#5a7da6";
const C_COURT = "#38506a";
const C_LINE = "rgba(255,255,255,0.85)";

// Timing (ms, at 1×).
const SEG_MS = 190; // per ball segment between two contacts
const POINT_PAUSE = 230; // hold after a point lands
const FLASH_MS = 1100; // how long a skill label stays up
const END_PAUSE = 1200;

// Player movement easing — frame-rate independent (1 - e^(-dt/τ)). Lower τ = snappier.
const EASE_TAU = 95;

// Home positions for the four players, normalized to court coords. 0,1 = team A
// (front, back); 2,3 = team B (front, back). Front players sit nearer the net.
const HOME: { x: number; y: number }[] = [
  { x: 0.34, y: 0.36 }, // A front
  { x: 0.16, y: 0.68 }, // A back
  { x: 0.66, y: 0.36 }, // B front
  { x: 0.84, y: 0.68 }, // B back
];

// Per-side horizontal bounds so a player never crosses the net.
const SIDE_BOUNDS = { A: [0.06, 0.46], B: [0.54, 0.94] } as const;

type SoundKind = "serve" | "hit" | "point" | "big" | "skill" | "end";

interface Segment {
  t0: number;
  t1: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  hitter: "A" | "B"; // struck the ball at (x0,y0)
  receiver: "A" | "B"; // will strike at (x1,y1)
}
interface ScoreMark {
  time: number;
  a: number;
  b: number;
}
interface SkillMark {
  time: number;
  team: "A" | "B";
  name: string;
}
interface SoundMark {
  time: number;
  kind: SoundKind;
  team?: "A" | "B";
}
interface LogEntry {
  time: number;
  text: string;
  team?: "A" | "B";
  emphasis?: boolean;
}

interface Timeline {
  segments: Segment[];
  scores: ScoreMark[];
  skills: SkillMark[];
  sounds: SoundMark[];
  log: LogEntry[];
  total: number;
}

function other(s: "A" | "B"): "A" | "B" {
  return s === "A" ? "B" : "A";
}

// --- commentary -------------------------------------------------------------

function teamLabel(team: TeamSpec): string {
  return `${team.playerName} & ${team.proName}`;
}

const SERVE_LINES = [
  (s: string) => `${s} to serve.`,
  (s: string) => `${s} step up to serve.`,
  (s: string) => `Serve goes in from ${s}.`,
  (s: string) => `${s} get us underway.`,
];
const RALLY_LINES = [
  "Long exchange — neither side blinks.",
  "Great retrieval off the back glass!",
  "They work it corner to corner...",
  "Patient build-up at the net.",
  "A lob floats over and resets it.",
  "Quick hands in the middle!",
];
const POINT_LINES = [
  (w: string, sc: string) => `Point ${w}. ${sc}.`,
  (w: string, sc: string) => `${w} take it — ${sc}.`,
  (w: string, sc: string) => `Won by ${w}. ${sc}.`,
];
const BIG_LINES = [
  (w: string, sc: string) => `Huge point! ${w} grab it — ${sc}.`,
  (w: string, sc: string) => `Under pressure, ${w} deliver! ${sc}.`,
  (w: string, sc: string) => `What a moment — ${w}! ${sc}.`,
];

function pick<T>(arr: T[], i: number): T {
  return arr[i % arr.length];
}

// --- timeline build ---------------------------------------------------------

// Flatten the script into absolute-time segments + cue tracks the render loop
// samples. Ball, player movement, sound, and commentary all derive from this —
// so the whole playback is a deterministic function of the deterministic script.
function buildTimeline(script: MatchScript): Timeline {
  const segments: Segment[] = [];
  const scores: ScoreMark[] = [];
  const skills: SkillMark[] = [];
  const sounds: SoundMark[] = [];
  const log: LogEntry[] = [];
  let t = 0;

  const labelA = teamLabel(script.teamA);
  const labelB = teamLabel(script.teamB);
  const label = (s: "A" | "B") => (s === "A" ? labelA : labelB);

  script.points.forEach((pt, pi) => {
    const rally = pt.rally;
    const times = rally.map((_, k) => t + k * SEG_MS);
    const sideAt = (k: number): "A" | "B" => (k % 2 === 0 ? pt.server : other(pt.server));

    sounds.push({ time: times[0], kind: "serve" });
    log.push({ time: times[0], text: pick(SERVE_LINES, pi)(label(pt.server)), team: pt.server });

    for (let k = 0; k < rally.length - 1; k++) {
      segments.push({
        t0: times[k],
        t1: times[k + 1],
        x0: rally[k].x,
        y0: rally[k].y,
        x1: rally[k + 1].x,
        y1: rally[k + 1].y,
        hitter: sideAt(k),
        receiver: sideAt(k + 1),
      });
      sounds.push({ time: times[k + 1], kind: "hit" });
    }

    // Mid-rally colour for longer points.
    if (rally.length >= 5) {
      const mid = times[Math.floor(rally.length / 2)];
      log.push({ time: mid, text: pick(RALLY_LINES, pi + rally.length) });
    }

    t = times[times.length - 1] + POINT_PAUSE;
    scores.push({ time: t, a: pt.scoreA, b: pt.scoreB });
    sounds.push({ time: t, kind: pt.big ? "big" : "point", team: pt.winner });

    if (pt.skill) {
      skills.push({ time: t, team: pt.skill.team, name: pt.skill.skill.name });
      sounds.push({ time: t + 40, kind: "skill", team: pt.skill.team });
      const who = pt.skill.skill.member === 0
        ? (pt.skill.team === "A" ? script.teamA.playerName : script.teamB.playerName)
        : (pt.skill.team === "A" ? script.teamA.proName : script.teamB.proName);
      log.push({ time: t - 10, text: `✦ ${pt.skill.skill.name} from ${who}!`, team: pt.skill.team });
    }

    // The deciding rally is the one that completes the fixed-sum game (scores
    // sum to the game length); the "Game!" line covers it, so skip the generic call.
    const isMatchPoint = pt.scoreA + pt.scoreB === script.pointsPerGame;
    const sc = `${pt.scoreA}–${pt.scoreB}`;
    if (!isMatchPoint) {
      const line = pt.big ? pick(BIG_LINES, pi)(label(pt.winner), sc) : pick(POINT_LINES, pi)(label(pt.winner), sc);
      log.push({ time: t, text: line, team: pt.winner, emphasis: pt.big });
    }
  });

  const winner = script.winner === "A" ? script.teamA : script.teamB;
  const finalSc = `${script.finalScore.a}–${script.finalScore.b}`;
  log.push({
    time: t,
    text: `Game! ${teamLabel(winner)} win it ${finalSc}.`,
    team: script.winner,
    emphasis: true,
  });
  sounds.push({ time: t + 150, kind: "end", team: script.winner });

  log.sort((p, q) => p.time - q.time);
  return { segments, scores, skills, sounds, log, total: t + END_PAUSE };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function segmentAt(segments: Segment[], clock: number): { seg: Segment; u: number } | null {
  for (const seg of segments) {
    if (clock >= seg.t0 && clock <= seg.t1) {
      const span = seg.t1 - seg.t0 || 1;
      return { seg, u: (clock - seg.t0) / span };
    }
  }
  return null;
}

function ballAt(segments: Segment[], clock: number): { x: number; y: number } {
  if (segments.length === 0) return { x: 0.5, y: 0.5 };
  const active = segmentAt(segments, clock);
  if (active) return { x: lerp(active.seg.x0, active.seg.x1, active.u), y: lerp(active.seg.y0, active.seg.y1, active.u) };
  if (clock < segments[0].t0) return { x: segments[0].x0, y: segments[0].y0 };
  let rest = segments[0];
  for (const seg of segments) if (seg.t1 <= clock) rest = seg;
  return { x: rest.x1, y: rest.y1 };
}

function nearestOnSide(side: "A" | "B", tx: number, ty: number): number {
  const idx = side === "A" ? [0, 1] : [2, 3];
  let best = idx[0];
  let bestD = Infinity;
  for (const i of idx) {
    const d = (HOME[i].x - tx) ** 2 + (HOME[i].y - ty) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

function playerTargets(segments: Segment[], clock: number): { x: number; y: number }[] {
  const targets = HOME.map((h) => ({ ...h }));
  const active = segmentAt(segments, clock);
  if (!active) return targets;
  const { seg } = active;

  const hb = SIDE_BOUNDS[seg.hitter];
  const striker = nearestOnSide(seg.hitter, seg.x0, seg.y0);
  targets[striker] = { x: clamp(seg.x0, hb[0], hb[1]), y: clamp(seg.y0, 0.12, 0.9) };

  const rb = SIDE_BOUNDS[seg.receiver];
  const receiver = nearestOnSide(seg.receiver, seg.x1, seg.y1);
  if (receiver !== striker) {
    targets[receiver] = { x: clamp(seg.x1, rb[0], rb[1]), y: clamp(seg.y1, 0.12, 0.9) };
  }
  return targets;
}

function cx(x: number): number {
  return PAD_X + x * (W - 2 * PAD_X);
}
function cy(y: number): number {
  return PAD_TOP + y * (H - PAD_TOP - PAD_BOTTOM);
}

// ---------------------------------------------------------------------------

export default function MatchSim({
  script,
  nameA,
  nameB,
  avatarA,
  avatarB,
}: {
  script: MatchScript;
  nameA?: string;
  nameB?: string;
  avatarA?: string | null; // real Reclub photo for team A's human player
  avatarB?: string | null; // real Reclub photo for team B's human player
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const logBoxRef = useRef<HTMLDivElement>(null);

  // The seed currently being played. Starts at the deterministic matchup seed
  // (so the first load is stable); Rematch re-rolls it to replay the *same* edge
  // with a fresh stream — different momentum, different score, the odd upset.
  const [seed, setSeed] = useState(script.seed);
  // Re-simulate client-side when the seed changes. The teams and the calibrated
  // edge are unchanged — only the PRNG stream differs — so the odds stay honest
  // while the story varies. The original seed returns the server-built script
  // verbatim (no recompute) to stay pixel-identical to first paint.
  const liveScript = useMemo(
    () =>
      seed === script.seed
        ? script
        : buildMatchScript({
            teamA: script.teamA,
            teamB: script.teamB,
            target: script.target,
            seed,
            pointsPerGame: script.pointsPerGame,
            edge: script.edge,
          }),
    [script, seed]
  );
  const timeline = useMemo(() => buildTimeline(liveScript), [liveScript]);

  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<1 | 2>(1);
  const [started, setStarted] = useState(false);
  const [ended, setEnded] = useState(false);
  const [muted, setMuted] = useState(false);
  const [revealed, setRevealed] = useState(0);

  const clockRef = useRef(0);
  const prevClockRef = useRef(0);
  const playingRef = useRef(false);
  const speedRef = useRef<1 | 2>(1);
  const mutedRef = useRef(false);
  const revealedRef = useRef(0);
  const lastTsRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const posRef = useRef(HOME.map((h) => ({ ...h })));
  const audioRef = useRef<AudioContext | null>(null);

  playingRef.current = playing;
  speedRef.current = speed;
  mutedRef.current = muted;

  // Most recent revealed commentary line — shown as a caption over the court.
  const latest = revealed > 0 ? timeline.log[revealed - 1] : null;

  // --- audio ---------------------------------------------------------------
  const ensureAudio = (): AudioContext | null => {
    if (typeof window === "undefined") return null;
    if (!audioRef.current) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      audioRef.current = new Ctor();
    }
    if (audioRef.current.state === "suspended") void audioRef.current.resume();
    return audioRef.current;
  };

  const blip = (freq: number, durMs: number, type: OscillatorType, gain: number, delayMs = 0) => {
    const ac = audioRef.current;
    if (!ac || mutedRef.current) return;
    const t0 = ac.currentTime + delayMs / 1000;
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + durMs / 1000);
    osc.connect(g);
    g.connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + durMs / 1000 + 0.03);
  };

  const playSound = (mark: SoundMark) => {
    if (mutedRef.current || !audioRef.current) return;
    switch (mark.kind) {
      case "serve":
        blip(520, 70, "square", 0.12);
        break;
      case "hit":
        blip(680 + ((Math.round(mark.time) % 7) * 28), 55, "triangle", 0.1);
        break;
      case "point":
        blip(mark.team === "A" ? 600 : 460, 150, "sine", 0.16);
        break;
      case "big":
        blip(mark.team === "A" ? 720 : 540, 180, "sine", 0.18);
        blip(mark.team === "A" ? 960 : 720, 180, "sine", 0.12, 70);
        break;
      case "skill": {
        const base = mark.team === "A" ? 660 : 500;
        blip(base, 90, "square", 0.12);
        blip(base * 1.25, 90, "square", 0.12, 70);
        blip(base * 1.5, 120, "square", 0.12, 140);
        break;
      }
      case "end": {
        const base = mark.team === "A" ? 523 : 440;
        blip(base, 160, "triangle", 0.18);
        blip(base * 1.26, 160, "triangle", 0.18, 130);
        blip(base * 1.5, 320, "triangle", 0.18, 260);
        break;
      }
    }
  };

  // The render + animation loop. Always running so the paused poster frame and
  // the commentary feed stay in sync; it only advances the clock while playing.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;

    const tick = (ts: number) => {
      if (lastTsRef.current == null) lastTsRef.current = ts;
      const dt = ts - lastTsRef.current;
      lastTsRef.current = ts;

      const prevClock = clockRef.current;
      if (playingRef.current) {
        clockRef.current = Math.min(timeline.total, clockRef.current + dt * speedRef.current);
        if (clockRef.current >= timeline.total) {
          playingRef.current = false;
          setPlaying(false);
          setEnded(true);
        }
      }
      const clock = clockRef.current;

      if (playingRef.current && clock > prevClock && clock - prevClock < 600) {
        for (const s of timeline.sounds) if (s.time > prevClock && s.time <= clock) playSound(s);
      }

      // Reveal commentary up to the current clock (only re-render on change).
      let rc = 0;
      for (const e of timeline.log) {
        if (e.time <= clock) rc++;
        else break;
      }
      if (rc !== revealedRef.current) {
        revealedRef.current = rc;
        setRevealed(rc);
      }

      const targets = playerTargets(timeline.segments, clock);
      const f = 1 - Math.exp(-(dt * speedRef.current) / EASE_TAU);
      const moving: boolean[] = [];
      for (let i = 0; i < posRef.current.length; i++) {
        const cur = posRef.current[i];
        const nx = lerp(cur.x, targets[i].x, f);
        const ny = lerp(cur.y, targets[i].y, f);
        moving[i] = Math.hypot(nx - cur.x, ny - cur.y) > 0.0015;
        cur.x = nx;
        cur.y = ny;
      }

      drawScene(ctx, liveScript, timeline, clock, posRef.current, moving, started);
      prevClockRef.current = clock;
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      lastTsRef.current = null;
    };
  }, [liveScript, timeline, started]);

  // Auto-scroll the commentary feed as new lines land.
  useEffect(() => {
    const box = logBoxRef.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [revealed]);

  const play = () => {
    ensureAudio();
    lastTsRef.current = null;
    setStarted(true);
    setPlaying(true);
  };
  const replay = () => {
    ensureAudio();
    clockRef.current = 0;
    prevClockRef.current = 0;
    revealedRef.current = 0;
    posRef.current = HOME.map((h) => ({ ...h }));
    lastTsRef.current = null;
    setRevealed(0);
    setStarted(true);
    setEnded(false);
    setPlaying(true);
  };
  const skipToResult = () => {
    clockRef.current = timeline.total;
    prevClockRef.current = timeline.total;
    posRef.current = HOME.map((h) => ({ ...h }));
    setStarted(true);
    setPlaying(false);
    setEnded(true);
  };
  // Re-roll the seed and play a fresh match of the same matchup. Math.random is
  // fine here (a client component, not pure lib/) — the new seed feeds the same
  // deterministic engine, so the result still honours the calibrated edge.
  const rematch = () => {
    ensureAudio();
    clockRef.current = 0;
    prevClockRef.current = 0;
    revealedRef.current = 0;
    posRef.current = HOME.map((h) => ({ ...h }));
    lastTsRef.current = null;
    setRevealed(0);
    setSeed((Math.floor(Math.random() * 0xffffffff) ^ (seed + 0x9e3779b9)) >>> 0);
    setStarted(true);
    setEnded(false);
    setPlaying(true);
  };

  // Sim odds from the calibrated edge (constant across rematches). Falls back to
  // the raw target when no breakdown was attached.
  const probA = script.edge?.target ?? script.target;
  const labelA = nameA ?? script.teamA.playerName;
  const labelB = nameB ?? script.teamB.playerName;

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.4fr_1fr]">
      <div>
        {/* Real player faces flanking the court — the on-court figures are 8-bit
            sprites, so this is where the actual Reclub photos show. */}
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <PlayerAvatar name={labelA} avatarUrl={avatarA} size={36} />
            <span className="truncate text-sm font-medium" style={{ color: "#0a6b56" }}>
              {labelA} <span className="text-muted">&amp; {script.teamA.proName}</span>
            </span>
          </div>
          <span className="mono-label shrink-0">vs</span>
          <div className="flex items-center gap-2 min-w-0 justify-end">
            <span className="truncate text-right text-sm font-medium" style={{ color: "#d6502f" }}>
              {labelB} <span className="text-muted">&amp; {script.teamB.proName}</span>
            </span>
            <PlayerAvatar name={labelB} avatarUrl={avatarB} size={36} />
          </div>
        </div>

        <div className="relative overflow-hidden rounded-sm border border-hairline" style={{ background: C_SURROUND }}>
          <canvas
            ref={canvasRef}
            style={{ width: "100%", height: "auto", imageRendering: "pixelated", display: "block" }}
            aria-label={`Pixel-art match: ${script.teamA.playerName} & ${script.teamA.proName} vs ${script.teamB.playerName} & ${script.teamB.proName}`}
          />
          {/* Live commentary caption — a lower-third overlaid on the court. */}
          {started && latest && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 p-2">
              <p
                className="rounded-sm bg-black/55 px-3 py-1.5 text-xs leading-snug text-white backdrop-blur-sm sm:text-sm"
                style={{
                  borderLeft: `3px solid ${
                    latest.team ? (latest.team === "A" ? "#7fe6cf" : "#ff9d85") : "#ffffff"
                  }`,
                }}
              >
                {latest.text}
              </p>
            </div>
          )}
        </div>

        {/* Sim odds — the calibrated edge this replay honours (constant across
            rematches; the score varies, the long-run win rate doesn't). */}
        <div className="mt-3 flex items-center justify-between text-xs tabular-nums">
          <span className="text-deep-green font-medium">
            {labelA} {Math.round(probA * 100)}%
          </span>
          <span className="mono-label">Sim win odds</span>
          <span className="text-coral font-medium">
            {Math.round((1 - probA) * 100)}% {labelB}
          </span>
        </div>

        {/* Controls */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {!started ? (
            <button type="button" onClick={play} className="btn-primary">
              ▶ Play match
            </button>
          ) : !ended ? (
            <button
              type="button"
              onClick={() => (playing ? setPlaying(false) : play())}
              className="btn-primary"
            >
              {playing ? "Pause" : "Resume"}
            </button>
          ) : (
            <button type="button" onClick={replay} className="btn-primary">
              Replay
            </button>
          )}
          {started && !ended && (
            <button type="button" onClick={replay} className="btn-secondary">
              Restart
            </button>
          )}
          {started && (
            <button type="button" onClick={rematch} className="btn-secondary" title="Re-roll a fresh match of the same matchup">
              🎲 Rematch
            </button>
          )}
          <button
            type="button"
            onClick={() => setSpeed((s) => (s === 1 ? 2 : 1))}
            className="btn-secondary tabular-nums"
          >
            {speed}×
          </button>
          {!ended && (
            <button type="button" onClick={skipToResult} className="btn-secondary">
              Skip to result
            </button>
          )}
          <button type="button" onClick={() => setMuted((m) => !m)} className="btn-secondary" aria-pressed={muted}>
            {muted ? "🔇 Muted" : "🔊 Sound"}
          </button>
        </div>
      </div>

      {/* Live commentary feed */}
      <div>
        <p className="mono-label mb-2">Match commentary</p>
        <div
          ref={logBoxRef}
          className="h-[260px] overflow-y-auto rounded-sm border border-hairline bg-canvas p-3 text-sm"
        >
          {revealed === 0 ? (
            <p className="text-muted">Press play to start the match — the call comes in live.</p>
          ) : (
            <ul className="space-y-1.5">
              {timeline.log.slice(0, revealed).map((e, i) => (
                <li
                  key={i}
                  className={e.emphasis ? "font-medium" : ""}
                  style={{ color: e.team ? (e.team === "A" ? "#0a6b56" : "#d6502f") : undefined }}
                >
                  {e.text}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Skill legend — grounded in each side's gear + pro */}
        <div className="mt-4 space-y-3">
          <SkillLegend team={script.teamA} />
          <SkillLegend team={script.teamB} />
        </div>
      </div>
    </div>
  );
}

function SkillLegend({ team }: { team: TeamSpec }) {
  return (
    <div className="border-t border-hairline pt-3">
      <p className="mono-label mb-2" style={{ color: team.color }}>
        {team.playerName} &amp; {team.proName}
      </p>
      <ul className="space-y-1">
        {team.skills.map((s) => (
          <li key={`${s.source}-${s.name}`} className="text-sm">
            <span className="font-medium text-ink">{s.name}</span>{" "}
            <span className="text-body-muted">— {s.effect}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// --- scene composition (pure draw) ------------------------------------------

function currentScore(scores: ScoreMark[], clock: number): { a: number; b: number } {
  let a = 0;
  let b = 0;
  for (const s of scores) {
    if (s.time <= clock) {
      a = s.a;
      b = s.b;
    } else break;
  }
  return { a, b };
}

function activeSkill(skills: SkillMark[], clock: number): SkillMark | null {
  let hit: SkillMark | null = null;
  for (const s of skills) if (clock >= s.time && clock <= s.time + FLASH_MS) hit = s;
  return hit;
}

// Draw the real-padel-court markings: surround, playing rectangle, net (with
// posts), two service lines, and the centre service line joining them.
function drawCourt(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = C_SURROUND;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = C_COURT;
  ctx.fillRect(cx(0), cy(0), cx(1) - cx(0), cy(1) - cy(0));

  // Glass-wall hint: a faint inner border just inside the playing rectangle.
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 1;
  ctx.strokeRect(cx(0) + 2.5, cy(0) + 2.5, cx(1) - cx(0) - 5, cy(1) - cy(0) - 5);

  ctx.strokeStyle = C_LINE;
  ctx.fillStyle = C_LINE;
  ctx.lineWidth = 1;
  // Outer boundary.
  ctx.strokeRect(cx(0) + 0.5, cy(0) + 0.5, cx(1) - cx(0) - 1, cy(1) - cy(0) - 1);
  // Service lines (parallel to the net).
  for (const sx of SERVICE_X) {
    ctx.fillRect(Math.round(cx(sx)), cy(0), 1, cy(1) - cy(0));
  }
  // Centre service line joining the two service lines.
  ctx.fillRect(cx(SERVICE_X[0]), Math.round(cy(0.5)), cx(SERVICE_X[1]) - cx(SERVICE_X[0]), 1);

  // Net: solid centre line + posts top & bottom.
  const nx = Math.round(cx(NET_X));
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.fillRect(nx - 1, cy(0) - 4, 2, cy(1) - cy(0) + 8);
  ctx.fillStyle = "#1b1b1b";
  ctx.fillRect(nx - 2, cy(0) - 6, 4, 4);
  ctx.fillRect(nx - 2, cy(1) + 2, 4, 4);
}

function drawScene(
  ctx: CanvasRenderingContext2D,
  script: MatchScript,
  timeline: Timeline,
  clock: number,
  positions: { x: number; y: number }[],
  moving: boolean[],
  started: boolean
) {
  drawCourt(ctx);

  const a = script.teamA;
  const b = script.teamB;
  const avatars = [a.avatars[0], a.avatars[1], b.avatars[0], b.avatars[1]];
  const facings: (1 | -1)[] = [1, 1, -1, -1];
  const names = [a.playerName, a.proName, b.playerName, b.proName];
  const labelColors = ["#dbeee9", "#bfe0d8", "#ffe0d6", "#ffcdbe"];
  const stepBit = Math.floor(clock / 110) % 2 === 0 ? 0 : 1;

  const order = [0, 1, 2, 3].sort((i, j) => positions[i].y - positions[j].y);
  ctx.textAlign = "center";
  ctx.font = "6px ui-monospace, monospace";
  for (const i of order) {
    const px = cx(positions[i].x);
    const py = cy(positions[i].y);
    drawAvatar(ctx, avatars[i], px, py, facings[i], moving[i] ? (stepBit as 0 | 1) : 0);
    ctx.fillStyle = labelColors[i];
    ctx.fillText(names[i], px, py + 22);
  }

  // Ball + shadow.
  const ball = ballAt(timeline.segments, clock);
  const bx = cx(ball.x);
  const by = cy(ball.y);
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.fillRect(Math.round(bx) - 1, Math.round(by) + 3, 3, 1);
  ctx.fillStyle = "#e8f94a";
  ctx.fillRect(Math.round(bx) - 1, Math.round(by) - 1, 3, 3);

  // Scoreboard.
  const { a: sa, b: sb } = currentScore(timeline.scores, clock);
  ctx.textAlign = "left";
  ctx.font = "bold 12px ui-monospace, monospace";
  ctx.fillStyle = "#7fe6cf";
  ctx.fillText(`${a.playerName.slice(0, 10)}`, PAD_X, 16);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 16px ui-monospace, monospace";
  ctx.textAlign = "center";
  ctx.fillText(`${sa} – ${sb}`, W / 2, 18);
  ctx.textAlign = "right";
  ctx.font = "bold 12px ui-monospace, monospace";
  ctx.fillStyle = "#ff9d85";
  ctx.fillText(`${b.playerName.slice(0, 10)}`, W - PAD_X, 16);

  // (The real player faces are shown in the React header above the court — see
  // MatchSim — so we don't draw a generated portrait by the scoreboard here.)

  // Skill flash.
  const sk = activeSkill(timeline.skills, clock);
  if (sk) {
    ctx.textAlign = "center";
    ctx.font = "bold 13px ui-monospace, monospace";
    ctx.fillStyle = sk.team === "A" ? "#7fe6cf" : "#ff9d85";
    ctx.fillText(`✦ ${sk.name} ✦`, W / 2, 38);
  }

  // Pre-start poster prompt.
  if (!started) {
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(0, H / 2 - 16, W, 32);
    ctx.textAlign = "center";
    ctx.font = "bold 13px ui-monospace, monospace";
    ctx.fillStyle = "#ffffff";
    ctx.fillText("Press play to simulate the match", W / 2, H / 2 + 4);
  }

  // Winner banner once finished.
  if (clock >= timeline.total) {
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, H / 2 - 22, W, 44);
    ctx.textAlign = "center";
    ctx.font = "bold 16px ui-monospace, monospace";
    const win = script.winner === "A" ? script.teamA : script.teamB;
    ctx.fillStyle = script.winner === "A" ? "#7fe6cf" : "#ff9d85";
    ctx.fillText(
      `${win.playerName} & ${win.proName} win ${script.finalScore.a}–${script.finalScore.b}`,
      W / 2,
      H / 2 + 5
    );
  }
}
