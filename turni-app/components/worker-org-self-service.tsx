"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export type WorkerSelfProfile = {
  firstName: string;
  lastName: string;
  email: string;
};

type Props = {
  profile: WorkerSelfProfile;
  displayLabel: string;
};

export function WorkerOrgSelfService({ profile, displayLabel }: Props) {
  const router = useRouter();
  const [pfFirst, setPfFirst] = useState(profile.firstName);
  const [pfLast, setPfLast] = useState(profile.lastName);
  const [pfEmail, setPfEmail] = useState(profile.email);
  const [pfPass, setPfPass] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState<string | null>(null);

  useEffect(() => {
    setPfFirst(profile.firstName);
    setPfLast(profile.lastName);
    setPfEmail(profile.email);
    setPfPass("");
  }, [profile.firstName, profile.lastName, profile.email]);

  async function saveProfile() {
    setProfileSaving(true);
    setProfileMsg(null);
    const res = await fetch("/api/me/account", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName: pfFirst,
        lastName: pfLast,
        email: pfEmail,
        password: pfPass || undefined,
      }),
    });
    const payload = (await res.json()) as { error?: string };
    setProfileSaving(false);
    if (!res.ok) {
      setProfileMsg(payload.error ?? "Salvataggio non riuscito.");
      return;
    }
    setProfileMsg("Profilo aggiornato.");
    setPfPass("");
    router.refresh();
  }

  return (
    <section className="card border-0 shadow-sm mt-3">
      <div className="card-body p-3 p-md-4">
        <h3 className="h6 fw-semibold mb-1">{displayLabel}</h3>
        <p className="small text-secondary mb-3">
          Aggiorna nome, cognome, email e password (lascia vuota la password per non modificarla).
        </p>
        <div className="row g-2">
          <div className="col-md-6">
            <label className="form-label small mb-1">Nome</label>
            <input className="form-control form-control-sm" value={pfFirst} onChange={(e) => setPfFirst(e.target.value)} />
          </div>
          <div className="col-md-6">
            <label className="form-label small mb-1">Cognome</label>
            <input className="form-control form-control-sm" value={pfLast} onChange={(e) => setPfLast(e.target.value)} />
          </div>
          <div className="col-md-6">
            <label className="form-label small mb-1">Email</label>
            <input type="email" className="form-control form-control-sm" value={pfEmail} onChange={(e) => setPfEmail(e.target.value)} />
          </div>
          <div className="col-md-6">
            <label className="form-label small mb-1">Nuova password</label>
            <input
              type="password"
              className="form-control form-control-sm"
              autoComplete="new-password"
              placeholder="••••••••"
              value={pfPass}
              onChange={(e) => setPfPass(e.target.value)}
            />
          </div>
        </div>
        <div className="d-flex flex-wrap align-items-center gap-2 mt-3">
          <button type="button" className="btn btn-sm btn-success" disabled={profileSaving} onClick={() => void saveProfile()}>
            {profileSaving ? "Salvataggio..." : "Salva profilo"}
          </button>
          {profileMsg ? <span className="small text-secondary">{profileMsg}</span> : null}
        </div>
      </div>
    </section>
  );
}
