import UploadForm from "./UploadForm";

export const metadata = { title: "Upload scoresheet · expose.padelleaderboard" };

export default function UploadPage() {
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
      <UploadForm />
    </div>
  );
}
