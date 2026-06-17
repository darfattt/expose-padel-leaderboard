import UploadForm from "./UploadForm";
import { getClubs } from "@/lib/clubs";

export const metadata = { title: "Upload scoresheet · expose.padelleaderboard" };

// Pulls in the server action's pdfjs-dist bundle; skip static prerender (which
// crashes under webpack) — there's nothing static to generate here anyway.
export const dynamic = "force-dynamic";

export default async function UploadPage() {
  const clubs = await getClubs();
  return (
    <div className="max-w-3xl">
      <p className="mono-label mb-4">Upload</p>
      <h1 className="font-display text-[48px] leading-none tracking-tight mb-3">
        Drop a Reclub scoresheet
      </h1>
      <p className="text-body-muted text-lg mb-10 max-w-xl">
        We parse every match, dedupe players across events, and update the career leaderboard.
        Nothing is saved until you confirm the preview.
      </p>
      <UploadForm clubs={clubs} />
    </div>
  );
}
