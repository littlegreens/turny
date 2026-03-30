"use client";

import Link from "next/link";
import { useState } from "react";

const PLANS = ["FREE", "STARTER", "PRO", "ENTERPRISE"] as const;
type PlanValue = (typeof PLANS)[number];

type Props = {
  org: {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    plan: string;
    createdAt: string;
    calendarCount: number;
    memberCount: number;
  };
};

export function AdminOrgCard({ org }: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(org.name);
  const [description, setDescription] = useState(org.description ?? "");
  const [plan, setPlan] = useState<PlanValue>((PLANS.includes(org.plan as PlanValue) ? (org.plan as PlanValue) : "FREE"));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/orgs/${org.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, plan }),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(payload.error ?? "Salvataggio non riuscito");
        return;
      }
      setOpen(false);
      window.location.reload();
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="card h-100">
        <div className="card-body d-flex flex-column gap-2">
          <div className="d-flex justify-content-between align-items-start gap-2">
            <div>
              <h3 className="h6 fw-bold mb-1">{org.name}</h3>
              <div className="small text-secondary">/{org.slug}</div>
            </div>
            <span className="badge text-bg-light border">{org.plan}</span>
          </div>
          <p className="small text-secondary mb-1">{org.description?.trim() || "Nessuna descrizione."}</p>
          <div className="small text-secondary">
            Calendari: <strong>{org.calendarCount}</strong> · Membri: <strong>{org.memberCount}</strong>
          </div>
          <div className="small text-secondary">Creata: {org.createdAt}</div>
          <div className="mt-2 d-flex gap-2">
            <button type="button" className="btn btn-sm btn-outline-success" onClick={() => setOpen(true)}>
              Modifica
            </button>
            <Link href={`/${org.slug}`} className="btn btn-sm btn-success">
              Entra
            </Link>
          </div>
        </div>
      </div>

      {open ? (
        <>
          <div className="modal fade show d-block" tabIndex={-1} role="dialog" aria-modal="true">
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content turny-modal">
                <div className="modal-header">
                  <h5 className="modal-title">Modifica società</h5>
                  <button type="button" className="btn-close" onClick={() => setOpen(false)} />
                </div>
                <div className="modal-body">
                  {error ? <div className="alert alert-danger py-2">{error}</div> : null}
                  <div className="mb-3">
                    <label className="form-label small mb-1">Nome</label>
                    <input className="form-control" value={name} onChange={(e) => setName(e.target.value)} disabled={loading} />
                  </div>
                  <div className="mb-3">
                    <label className="form-label small mb-1">Descrizione</label>
                    <textarea className="form-control" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} disabled={loading} />
                  </div>
                  <div>
                    <label className="form-label small mb-1">Piano</label>
                    <select className="form-select" value={plan} onChange={(e) => setPlan(e.target.value as PlanValue)} disabled={loading}>
                      {PLANS.map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="modal-footer">
                  <button className="btn btn-outline-secondary" onClick={() => setOpen(false)} disabled={loading}>Annulla</button>
                  <button className="btn btn-success" onClick={() => void save()} disabled={loading}>
                    {loading ? "Salvataggio..." : "Salva"}
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.06)", zIndex: 1040 }} onClick={() => setOpen(false)} />
        </>
      ) : null}
    </>
  );
}

