import { getRacketRecommendations, getRacketShape } from "@/app/actions/player";
import type { Attributes } from "@/lib/archetype";
import {
  ownedRacketContrast,
  playStyleBlurb,
  racketCriteria,
  shapeToStyle,
} from "@/lib/racket-reco";
import type { PlayerGear } from "@/lib/types";

// Async server component: the third-party Padelful call streams in behind a
// Suspense boundary so it never blocks the player page (mirrors ReportCardAsync).
export default async function RacketRecoAsync({
  rating,
  attributes,
  gear,
}: {
  rating: number;
  attributes: Attributes;
  gear: PlayerGear;
}) {
  const recs = (await getRacketRecommendations(rating, attributes)).slice(0, 3);
  if (recs.length === 0) return null;

  const { level, playStyle } = racketCriteria(rating, attributes);

  // Coaching line: contrast the player's computed style against the frame they
  // actually own (classified from its shape). Skipped when no racket is set or
  // its shape is unknown.
  let contrast: string | null = null;
  if (gear.racketSlug) {
    const ownedStyle = shapeToStyle(await getRacketShape(gear.racketSlug));
    contrast = ownedRacketContrast(playStyle, ownedStyle, gear.racketName ?? "current racket");
  }

  return (
    <div className="mt-5 border-t border-hairline pt-4">
      <p className="mono-label mb-1">
        Racket picks · {level} · {playStyle}
      </p>
      <p className="mb-3 text-xs text-body-muted">{playStyleBlurb(playStyle)}</p>
      {contrast && (
        <p className="mb-3 border-l-2 border-card-border pl-2 text-xs text-body-muted">
          {contrast}
        </p>
      )}
      <ul className="space-y-1">
        {recs.map((r) => (
          <li key={r.slug}>
            <a
              href={r.url ?? "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 py-1.5 hover:opacity-70"
              title={r.matchReason || r.model}
            >
              <RacketThumb image={r.image} alt={r.model} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-ink truncate">{r.model}</span>
                <span className="block text-xs text-body-muted truncate">
                  {[r.brand, r.shape, r.feel].filter(Boolean).join(" · ")}
                </span>
                {r.matchReason && (
                  <span className="mt-0.5 block text-xs text-body-muted line-clamp-2">
                    {r.matchReason}
                  </span>
                )}
              </span>
              <span className="shrink-0 text-right">
                {r.price != null && (
                  <span className="block font-mono text-sm tabular-nums text-ink">
                    €{Math.round(r.price)}
                  </span>
                )}
                {r.rating && <span className="block mono-label">★ {r.rating}</span>}
              </span>
            </a>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[11px] text-muted">Matched to your attributes · padelful.com</p>
    </div>
  );
}

// Product shot on a soft tile; falls back to a ball glyph so a missing image
// never renders broken. Padelful PNGs are transparent shots, so object-contain
// keeps them fully exposed (mirrors the GearCard thumb).
function RacketThumb({ image, alt }: { image: string | null; alt: string }) {
  return (
    <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-md border border-hairline bg-soft-stone">
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote Padelful URL; avoids next/image domain config
        <img
          src={image}
          alt={alt}
          width={44}
          height={44}
          className="h-full w-full object-contain p-1"
          loading="lazy"
        />
      ) : (
        <span aria-hidden className="text-base">
          🎾
        </span>
      )}
    </span>
  );
}

// Placeholder shown while the recommendations stream in.
export function RacketRecoSkeleton() {
  return (
    <div className="mt-5 border-t border-hairline pt-4">
      <div className="mb-3 h-3 w-40 animate-pulse rounded bg-soft-stone" />
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-11 animate-pulse rounded bg-soft-stone" />
        ))}
      </div>
    </div>
  );
}
