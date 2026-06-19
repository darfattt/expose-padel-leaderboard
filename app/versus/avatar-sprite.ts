import type { AvatarSpec } from "@/lib/sim/avatar";

// Shared pixel-sprite renderer for an AvatarSpec. Lives outside MatchSim so both
// the match canvas and the static team headers draw identical avatars. Pure draw
// on a 2D context, origin-centred at (px, py): the art spans roughly x[-7,7],
// y[-14,14] around that point (taller now that hats/crowns sit above the head).

// Optional dramatic pose applied during a skill effect (knocked down, frozen,
// flung off the court, ghosted for an after-image dash) or the post-match
// celebration (winners hop with arms up, losers slump and cry). All default to
// "no effect" so resting frames stay pixel-identical to before.
export interface AvatarPose {
  tilt?: number; // radians; topples about the feet (a knockdown)
  spin?: number; // radians; whirls the whole figure in place (a tornado / a tumble)
  alpha?: number; // 0..1 — ghost/after-image transparency
  frost?: number; // 0..1 — icy coating + frost flecks
  flash?: number; // 0..1 — white impact flash over the body
  lift?: number; // pixels raised off the ground (a celebratory jump)
  cheer?: number; // 0..1 — arms thrown up in a victory V
  tears?: number; // 0..1 — crying streaks down the face
  launch?: number; // signed pixels flung sideways off the court (out of the pitch)
  arc?: number; // pixels lifted during the launch arc (the crash trajectory)
}

const HAIR_BY_STYLE: Record<
  AvatarSpec["hairStyle"],
  (px: (x: number, y: number, w: number, h: number, c: string) => void, spec: AvatarSpec) => void
> = {
  // 0 short
  0: (px, s) => px(-3, -11, 6, 2, s.hair),
  // 1 cap (close crop)
  1: (px, s) => {
    px(-3, -12, 6, 2, s.hair);
    px(-3, -11, 6, 1, s.hair);
  },
  // 2 long (shoulder-length, unisex)
  2: (px, s) => {
    px(-3, -11, 6, 2, s.hair);
    px(-3, -9, 1, 4, s.hair);
    px(2, -9, 1, 4, s.hair);
  },
  // 3 bald
  3: () => {},
  // 4 ponytail (a long tail down the back)
  4: (px, s) => {
    px(-3, -11, 6, 2, s.hair);
    px(-3, -9, 1, 2, s.hair);
    px(2, -9, 1, 2, s.hair);
    px(-5, -10, 2, 8, s.hair); // the ponytail hanging down one side
  },
  // 5 bun (a knot on top, hair tucked at the sides)
  5: (px, s) => {
    px(-3, -11, 6, 2, s.hair);
    px(-1, -13, 3, 3, s.hair); // the bun
    px(-3, -9, 1, 3, s.hair);
    px(2, -9, 1, 3, s.hair);
  },
};

export function drawAvatar(
  ctx: CanvasRenderingContext2D,
  spec: AvatarSpec,
  px: number,
  py: number,
  facing: 1 | -1,
  step: 0 | 1,
  pose?: AvatarPose
) {
  const tilt = pose?.tilt ?? 0;
  const spin = pose?.spin ?? 0;
  const lift = pose?.lift ?? 0;
  const cheer = pose?.cheer ?? 0;
  const launch = pose?.launch ?? 0;

  // Ground shadow stays planted (absolute coords) while the figure hops, and
  // shrinks with height so the jump reads. Skipped for a toppled or flung figure.
  if (!tilt && !launch) {
    const s = Math.max(0.4, 1 - lift / 22);
    ctx.fillStyle = `rgba(0,0,0,${0.18 * s})`;
    ctx.fillRect(Math.round(px - 5 * s), Math.round(py + 12), Math.round(10 * s), 2);
  }

  ctx.save();
  if (tilt) {
    // Rotate the whole figure about its feet so a hit topples it over rather than
    // spinning in place. Feet sit at local y≈12.
    ctx.translate(px, py + 12);
    ctx.rotate(tilt);
    ctx.translate(0, -12);
  } else if (launch) {
    // Flung clean off the court — sails outward and up, tumbling, then crashes
    // into the back glass. The launch/arc drive the trajectory; spin tumbles it.
    ctx.translate(px + launch, py - lift - (pose?.arc ?? 0));
    ctx.rotate(spin);
  } else if (spin) {
    // Whirl the whole figure about its own centre — caught in the tornado,
    // "berputar putar". A lift lets the feet leave the ground as it spins.
    ctx.translate(px, py - lift);
    ctx.rotate(spin);
  } else {
    // Integer translate keeps the pixels crisp at rest; lift raises the hop.
    ctx.translate(Math.round(px), Math.round(py - lift));
  }
  if (pose?.alpha != null) ctx.globalAlpha = pose.alpha;

  const p = (x: number, y: number, w: number, h: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(Math.round(x), Math.round(y), w, h);
  };

  // Lower body — a skirt ("celana rok") for women, shorts (short pants) for men.
  if (spec.bottom === "skirt") {
    // Thin legs below a flared skirt.
    if (step === 0) {
      p(-2, 9, 2, 3, spec.skin);
      p(1, 9, 2, 3, spec.skin);
    } else {
      p(-3, 9, 2, 3, spec.skin);
      p(2, 9, 2, 3, spec.skin);
    }
    // Flared trapezoid skirt over the hips.
    p(-3, 5, 6, 1, spec.shorts);
    p(-4, 6, 8, 2, spec.shorts);
    p(-5, 8, 10, 1, spec.shorts);
  } else if (step === 0) {
    p(-3, 6, 2, 6, spec.shorts);
    p(1, 6, 2, 6, spec.shorts);
  } else {
    p(-4, 6, 2, 5, spec.shorts);
    p(2, 6, 2, 5, spec.shorts);
  }

  p(-3, -2, 6, 8, spec.kit);
  if (cheer > 0) {
    // Arms thrown up in a victory V, fists at the top.
    p(-6, -6, 2, 6, spec.kit);
    p(4, -6, 2, 6, spec.kit);
    p(-7, -7, 2, 2, spec.skin);
    p(5, -7, 2, 2, spec.skin);
  } else {
    p(-5, -1, 2, 5, spec.kit);
    p(3, -1, 2, 5, spec.kit);
  }
  p(-3, -9, 6, 6, spec.skin);
  HAIR_BY_STYLE[spec.hairStyle](p, spec);
  // A plain sweatband only when nothing else sits on the brow.
  if (spec.headband && (spec.accessory === "none" || spec.accessory === "glasses")) {
    p(-3, -7, 6, 1, "#ffffff");
  }

  // Head accessory, layered over the hair.
  switch (spec.accessory) {
    case "hat": {
      // A cap: crown + a brim poking out in the facing direction (uses the
      // shorts colour so the kit/cap read as a coordinated outfit).
      p(-4, -12, 8, 2, spec.shorts);
      p(-4, -10, 8, 1, spec.shorts);
      p(facing === 1 ? 3 : -5, -10, 2, 1, spec.shorts);
      break;
    }
    case "bandana": {
      // A band across the forehead with a knot trailing off one side.
      p(-3, -8, 6, 1, "#d62828");
      p(facing === 1 ? -5 : 3, -8, 2, 3, "#d62828");
      break;
    }
    case "glasses": {
      // Black shades over the eyes — two lenses joined by a bridge.
      p(-3, -6, 2, 2, "#1b1b1b");
      p(1, -6, 2, 2, "#1b1b1b");
      p(-1, -6, 2, 1, "#1b1b1b");
      break;
    }
    case "crown": {
      // A little golden crown — a band with four points.
      p(-3, -12, 6, 2, "#f5c518");
      p(-3, -14, 1, 2, "#f5c518");
      p(-1, -14, 1, 2, "#f5c518");
      p(1, -14, 1, 2, "#f5c518");
      p(3, -14, 1, 2, "#f5c518");
      break;
    }
  }

  const rx = facing === 1 ? 5 : -7;
  p(rx, -2, 2, 2, "#1b1b1b");
  p(rx + (facing === 1 ? 1 : 0), -5, 2, 3, "#444");

  // Tears — pale streaks running from the eyes, lengthening as the cry builds.
  if (pose?.tears) {
    const a = Math.min(1, pose.tears);
    const len = 1 + Math.round(a * 4);
    ctx.globalAlpha = a;
    p(-2, -6, 1, len, "#9fd8ff");
    p(2, -6, 1, len, "#9fd8ff");
    ctx.fillStyle = "#cdeeff";
    ctx.fillRect(-2, -6 + len, 1, 1);
    ctx.fillRect(2, -6 + len, 1, 1);
    ctx.globalAlpha = 1;
  }

  // Frozen coating — a translucent ice glaze plus a few frost flecks.
  if (pose?.frost) {
    ctx.globalAlpha = 0.4 * pose.frost;
    ctx.fillStyle = "#bfe9ff";
    ctx.fillRect(-6, -12, 12, 25);
    ctx.globalAlpha = Math.min(1, 0.9 * pose.frost);
    p(-5, -7, 1, 1, "#ffffff");
    p(3, -3, 1, 1, "#ffffff");
    p(-1, 3, 1, 1, "#ffffff");
    p(1, -10, 1, 1, "#ffffff");
  }
  // White impact flash on the body at the moment of a hit.
  if (pose?.flash) {
    ctx.globalAlpha = Math.min(1, pose.flash);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(-6, -12, 12, 25);
  }

  ctx.restore();
}
