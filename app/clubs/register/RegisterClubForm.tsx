"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { registerClub } from "@/app/actions/clubs";
import { slugify } from "@/lib/slug";

export default function RegisterClubForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [superPassword, setSuperPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ name: string; slug: string } | null>(null);
  const [isSaving, startSave] = useTransition();

  const slug = slugify(name);

  function handleSubmit() {
    setError(null);
    if (!name.trim()) return setError("Enter a club name.");
    if (!adminPassword.trim()) return setError("Set an admin password for the club.");
    if (!superPassword.trim()) return setError("Enter the super-admin password to register.");

    const fd = new FormData();
    fd.append("name", name.trim());
    fd.append("adminPassword", adminPassword);
    fd.append("superPassword", superPassword);
    startSave(async () => {
      const res = await registerClub(fd);
      if (res.ok && res.slug) {
        setDone({ name: name.trim(), slug: res.slug });
      } else {
        setError(res.error ?? "Failed to register club.");
      }
    });
  }

  if (done) {
    return (
      <div className="card p-6 max-w-xl">
        <p className="mono-label mb-2">Club created</p>
        <h2 className="font-display text-2xl tracking-tight mb-1">{done.name}</h2>
        <p className="text-body-muted text-sm mb-6">
          Handle: <span className="font-mono">{done.slug}</span>. Club admins can now upload events
          for it using the admin password you set.
        </p>
        <div className="flex items-center gap-4">
          <button onClick={() => router.push("/upload")} className="btn-primary">
            Upload a scoresheet
          </button>
          <button
            onClick={() => {
              setDone(null);
              setName("");
              setAdminPassword("");
              setSuperPassword("");
            }}
            className="btn-secondary"
          >
            Register another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card p-6 max-w-xl">
      <label className="block">
        <span className="mono-label">Club name</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Expose Padel"
          className="mt-1 w-full rounded-sm border border-card-border bg-white px-3 py-2 font-display text-xl tracking-tight focus:border-primary focus:outline-none"
        />
        {slug && (
          <span className="mt-1 block text-xs text-body-muted">
            Handle: <span className="font-mono">{slug}</span>
          </span>
        )}
      </label>

      <label className="mt-6 block">
        <span className="mono-label">Club admin password</span>
        <input
          type="password"
          value={adminPassword}
          onChange={(e) => setAdminPassword(e.target.value)}
          placeholder="Used to upload events for this club"
          autoComplete="new-password"
          className="mt-1 w-full rounded-sm border border-card-border bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none"
        />
      </label>

      <label className="mt-6 block">
        <span className="mono-label">Super-admin password</span>
        <input
          type="password"
          value={superPassword}
          onChange={(e) => setSuperPassword(e.target.value)}
          placeholder="Required to register a club"
          autoComplete="off"
          className="mt-1 w-full rounded-sm border border-card-border bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none"
        />
      </label>

      {error && (
        <p className="mt-4 text-sm" style={{ color: "#b30000" }}>
          {error}
        </p>
      )}

      <div className="mt-6">
        <button
          onClick={handleSubmit}
          disabled={isSaving}
          className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isSaving ? "Creating…" : "Register club"}
        </button>
      </div>
    </div>
  );
}
