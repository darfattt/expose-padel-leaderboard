import Link from "next/link";

export const metadata = { title: "Request a club" };

// WhatsApp contact for the super-admin who provisions new clubs.
const ADMIN_WHATSAPP = "62817707004";
const WHATSAPP_MESSAGE =
  "Hi, I'd like to create a new club on the Padel Leaderboard. Club name: ";
const WHATSAPP_LINK = `https://wa.me/${ADMIN_WHATSAPP}?text=${encodeURIComponent(
  WHATSAPP_MESSAGE
)}`;

export default function NewClubPage() {
  return (
    <div className="max-w-3xl">
      <p className="mono-label mb-4">Clubs</p>
      <h1 className="font-display text-[48px] leading-none tracking-tight mb-3">
        Create a new club
      </h1>
      <p className="text-body-muted text-lg mb-10 max-w-xl">
        A club scopes its own events and leaderboard. New clubs are set up by the
        admin — message us on WhatsApp with your club name and we&apos;ll get you a
        handle and an admin password so you can start uploading scoresheets.
      </p>

      <div className="card p-6 max-w-xl">
        <p className="mono-label mb-2">Ask the admin</p>
        <h2 className="font-display text-2xl tracking-tight mb-1">
          Message us to create your club
        </h2>
        <p className="text-body-muted text-sm mb-6">
          Tap the button below to open a chat with the admin on WhatsApp at{" "}
          <span className="font-mono">+62 817-707-004</span>. Tell us your club
          name and we&apos;ll set it up.
        </p>
        <a
          href={WHATSAPP_LINK}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-primary inline-flex items-center gap-2"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden
          >
            <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 1.67c2.2 0 4.27.86 5.83 2.42a8.2 8.2 0 0 1 2.42 5.82c0 4.54-3.7 8.24-8.25 8.24a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.11.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.24-8.24h-.01Zm-4.6 4.43c-.21 0-.55.08-.84.39-.29.31-1.1 1.08-1.1 2.62 0 1.54 1.12 3.03 1.28 3.24.16.21 2.2 3.36 5.33 4.59 2.6 1.02 3.13.82 3.7.77.56-.05 1.82-.74 2.08-1.46.26-.72.26-1.34.18-1.46-.08-.13-.29-.21-.6-.36-.31-.16-1.82-.9-2.1-1-.28-.1-.49-.16-.7.16-.21.31-.8 1-.98 1.21-.18.21-.36.24-.67.08-.31-.16-1.3-.48-2.48-1.53-.92-.82-1.54-1.83-1.72-2.14-.18-.31-.02-.48.14-.63.14-.14.31-.36.47-.54.16-.18.21-.31.31-.52.1-.21.05-.39-.03-.55-.08-.16-.7-1.69-.96-2.31-.25-.6-.51-.52-.7-.53h-.6Z" />
          </svg>
          Message admin on WhatsApp
        </a>
        <p className="text-body-muted text-xs mt-4">
          No WhatsApp? You can also reach us at +62 817-707-004.
        </p>
      </div>

      <p className="text-body-muted text-sm mt-8 flex flex-wrap gap-x-4 gap-y-1">
        <Link href="/upload" className="text-action-blue hover:underline">
          Back to upload
        </Link>
        <Link href="/clubs/register" className="text-action-blue hover:underline">
          Admin: register a club
        </Link>
      </p>
    </div>
  );
}
