import { describe, expect, it } from "vitest";
import {
  drawConfetti,
  drawSkillFx,
  fxDynamics,
  fxImpactFraction,
  fxKindForSkill,
  type FxKind,
} from "./skill-fx";

// Throwaway smoke test: exercise every skill effect across its whole timeline
// against a stub 2D context, asserting nothing throws, dynamics stay finite, and
// each draw leaves globalAlpha reset to 1 (so it doesn't bleed into later draws).
function stubCtx() {
  const ctx = {
    globalAlpha: 1,
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    font: "",
    textAlign: "",
    save() {},
    restore() {},
    translate() {},
    rotate() {},
    beginPath() {},
    arc() {},
    ellipse() {},
    moveTo() {},
    lineTo() {},
    closePath() {},
    fill() {},
    stroke() {},
    fillRect() {},
    strokeRect() {},
    fillText() {},
  };
  return ctx as unknown as CanvasRenderingContext2D & { globalAlpha: number };
}

const KINDS: FxKind[] = [
  "cannon",
  "fireserve",
  "netbreak",
  "ice",
  "vibora",
  "wall",
  "greatwall",
  "lob",
  "tornado",
  "allcourt",
  "closer",
  "smart",
];

describe("skill-fx", () => {
  it("maps every named skill to a kind", () => {
    expect(fxKindForSkill("Cannon Smash")).toBe("cannon");
    expect(fxKindForSkill("Fire Serve")).toBe("fireserve");
    expect(fxKindForSkill("Net Breaker")).toBe("netbreak");
    expect(fxKindForSkill("Ice Bandeja")).toBe("ice");
    expect(fxKindForSkill("Víbora")).toBe("vibora");
    expect(fxKindForSkill("Great Wall")).toBe("greatwall");
    expect(fxKindForSkill("Wall Defense")).toBe("greatwall"); // legacy name, upgraded visual
    expect(fxKindForSkill("Tornado Lob")).toBe("tornado");
    expect(fxKindForSkill("Metronome Lob")).toBe("tornado"); // legacy name, upgraded visual
    expect(fxKindForSkill("All-Court")).toBe("allcourt");
    expect(fxKindForSkill("Closer Instinct")).toBe("closer");
    expect(fxKindForSkill("Smart Play")).toBe("smart");
    expect(fxKindForSkill("anything else")).toBe("smart");
  });

  it("gives every kind an impact fraction inside the flash window", () => {
    for (const kind of KINDS) {
      const f = fxImpactFraction(kind);
      expect(Number.isFinite(f)).toBe(true);
      expect(f).toBeGreaterThan(0);
      expect(f).toBeLessThan(1);
    }
  });

  it("dynamics stay finite and in range across the timeline", () => {
    for (const kind of KINDS) {
      for (let p = 0; p <= 1.0001; p += 0.05) {
        const { knockdown, shake } = fxDynamics(kind, p);
        expect(Number.isFinite(knockdown)).toBe(true);
        expect(Number.isFinite(shake)).toBe(true);
        expect(knockdown).toBeGreaterThanOrEqual(0);
        expect(knockdown).toBeLessThanOrEqual(1);
        expect(shake).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("draws every effect without throwing and resets alpha", () => {
    const geom = { ax: 120, ay: 150, vx: 360, vy: 120 };
    for (const kind of KINDS) {
      for (let p = 0; p <= 1.0001; p += 0.05) {
        const ctx = stubCtx();
        expect(() => drawSkillFx(ctx, kind, p, geom, "#7fe6cf", 12345)).not.toThrow();
        expect(ctx.globalAlpha).toBe(1);
      }
    }
  });

  it("rains confetti without throwing and resets alpha across the celebration", () => {
    for (let t = 0; t < 6000; t += 120) {
      const ctx = stubCtx();
      expect(() => drawConfetti(ctx, t, 30, 450, 50, 244)).not.toThrow();
      expect(ctx.globalAlpha).toBe(1);
    }
  });
});
