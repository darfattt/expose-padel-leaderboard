import RegisterClubForm from "./RegisterClubForm";

export const metadata = { title: "Register a club · expose.padelleaderboard" };

export default function NewClubPage() {
  return (
    <div className="max-w-3xl">
      <p className="mono-label mb-4">Clubs</p>
      <h1 className="font-display text-[48px] leading-none tracking-tight mb-3">
        Register a new club
      </h1>
      <p className="text-body-muted text-lg mb-10 max-w-xl">
        A club scopes its own events and leaderboard. Set an admin password — a club admin can use it
        to upload scoresheets for this club without the super-admin password.
      </p>
      <RegisterClubForm />
    </div>
  );
}
