// A bouncing, spinning padel ball with a squashing shadow. Pure markup + CSS
// (keyframes in globals.css) — safe to render on the server.
export default function PadelBallLoader({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-6">
      <div className="relative h-16 w-12">
        <div className="padel-bounce flex h-12 w-12 items-center justify-center">
          <svg
            viewBox="0 0 100 100"
            className="padel-spin h-12 w-12 drop-shadow"
            aria-hidden="true"
          >
            <circle cx="50" cy="50" r="46" fill="#c7f23f" />
            <circle cx="50" cy="50" r="46" fill="none" stroke="#a9d62f" strokeWidth="2" />
            {/* Tennis/padel seam: two opposing bowed curves wrapping the front. */}
            <path
              d="M12 28 C 38 46, 62 46, 88 28"
              fill="none"
              stroke="#ffffff"
              strokeWidth="5"
              strokeLinecap="round"
            />
            <path
              d="M12 72 C 38 54, 62 54, 88 72"
              fill="none"
              stroke="#ffffff"
              strokeWidth="5"
              strokeLinecap="round"
            />
          </svg>
        </div>
        {/* Ground shadow */}
        <div
          className="padel-shadow absolute bottom-0 left-1/2 h-1.5 w-10 -translate-x-1/2 rounded-full bg-black"
          style={{ filter: "blur(1px)" }}
        />
      </div>
      {label && <p className="mono-label text-white/70">{label}</p>}
    </div>
  );
}
