import { getIcon } from "@/lib/icons";

// Inline game-icons.net glyph. A server-safe component (no hooks/state): it inlines
// the icon's SVG body so it tints with CSS `color`/`currentColor` and scales crisply.
// When the name is unknown it falls back to the supplied emoji so a typo degrades
// gracefully instead of vanishing — every badge keeps its original emoji for exactly
// this (and for plain-text share captions, where an SVG can't go).
export default function GameIcon({
  name,
  size = 20,
  color,
  className,
  title,
  fallback,
}: {
  name: string;
  size?: number;
  color?: string;
  className?: string;
  title?: string; // when set, the icon is announced; otherwise it's decorative
  fallback?: string; // emoji shown if the icon name isn't in the bundle
}) {
  const ic = getIcon(name);
  if (!ic) {
    if (!fallback) return null;
    return (
      <span aria-hidden className={className} style={{ fontSize: size, lineHeight: 1 }}>
        {fallback}
      </span>
    );
  }
  return (
    <svg
      viewBox={`0 0 ${ic.w} ${ic.h}`}
      width={size}
      height={size}
      className={className}
      role="img"
      aria-hidden={title ? undefined : true}
      aria-label={title}
      fill="currentColor"
      style={color ? { color } : undefined}
      // The generated body is trusted, build-time-vendored SVG markup — never user input.
      dangerouslySetInnerHTML={{ __html: ic.body }}
    />
  );
}
