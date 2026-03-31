"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAppToast } from "@/components/app-toast-provider";

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
  const router = useRouter();
  const { showToast } = useAppToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(org.name);
  const [description, setDescription] = useState(org.description ?? "");
  const [plan, setPlan] = useState<PlanValue>((PLANS.includes(org.plan as PlanValue) ? (org.plan as PlanValue) : "FREE"));
  const [loading, setLoading] = useState(false);

  async function save() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/orgs/${org.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, plan }),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        showToast("error", payload.error ?? "Salvataggio non riuscito");
        return;
      }
      setOpen(false);
      showToast("success", "Società aggiornata.");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <li className="border rounded p-3">
        <div className="d-flex justify-content-between align-items-center gap-3 flex-wrap">
          <div className="d-flex align-items-start gap-3 flex-grow-1">
            <span
              className="rounded-circle border mt-1"
              style={{ backgroundColor: "#1f7a3f", width: 14, height: 14, flex: "0 0 14px" }}
              aria-hidden="true"
            />
            <div>
              <p className="fw-semibold mb-0">{org.name}</p>
              <p className="small text-secondary mb-0">
                /{org.slug} · Piano: {org.plan} · Calendari: {org.calendarCount} · Membri: {org.memberCount}
              </p>
              <p className="small text-secondary mb-0">{org.description?.trim() || "Nessuna descrizione."}</p>
            </div>
          </div>
          <div className="d-flex gap-2">
            <button type="button" className="btn btn-sm btn-outline-success" onClick={() => setOpen(true)}>
              Modifica
            </button>
            <Link href={`/${org.slug}`} className="btn btn-sm btn-success">
              Entra
            </Link>
          </div>
        </div>
      </li>

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

