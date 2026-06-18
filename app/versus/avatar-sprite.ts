import type { AvatarSpec } from "@/lib/sim/avatar";

// Shared pixel-sprite renderer for an AvatarSpec. Lives outside MatchSim so both
// the match canvas and the static <AvatarChip> (team headers) draw identical
// avatars. Pure draw on a 2D context, origin-centred at (px, py): the art spans
// roughly x[-7,7], y[-11,14] around that point.

const HAIR_BY_STYLE: Record<
  AvatarSpec["hairStyle"],
  (px: (x: number, y: number, w: number, h: number, c: string) => void, spec: AvatarSpec) => void
> = {
  0: (px, s) => px(-3, -11, 6, 2, s.hair),
  1: (px, s) => {
    px(-3, -12, 6, 2, s.hair);
    px(-3, -11, 6, 1, s.hair);
  },
  2: (px, s) => {
    px(-3, -11, 6, 2, s.hair);
    px(-3, -9, 1, 4, s.hair);
    px(2, -9, 1, 4, s.hair);
  },
  3: () => {},
};

export function drawAvatar(
  ctx: CanvasRenderingContext2D,
  spec: AvatarSpec,
  px: number,
  py: number,
  facing: 1 | -1,
  step: 0 | 1
) {
  const p = (x: number, y: number, w: number, h: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(Math.round(px + x), Math.round(py + y), w, h);
  };
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.fillRect(Math.round(px - 5), Math.round(py + 12), 10, 2);
  if (step === 0) {
    p(-3, 6, 2, 6, spec.shorts);
    p(1, 6, 2, 6, spec.shorts);
  } else {
    p(-4, 6, 2, 5, spec.shorts);
    p(2, 6, 2, 5, spec.shorts);
  }
  p(-3, -2, 6, 8, spec.kit);
  p(-5, -1, 2, 5, spec.kit);
  p(3, -1, 2, 5, spec.kit);
  p(-3, -9, 6, 6, spec.skin);
  HAIR_BY_STYLE[spec.hairStyle](p, spec);
  if (spec.headband) p(-3, -7, 6, 1, "#ffffff");
  const rx = facing === 1 ? 5 : -7;
  p(rx, -2, 2, 2, "#1b1b1b");
  p(rx + (facing === 1 ? 1 : 0), -5, 2, 3, "#444");
}
