"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useAppToast } from "@/components/app-toast-provider";
import { ConfirmModal } from "@/components/confirm-modal";

type Props = {
  scheduleId: string;
  year: number;
  month: number;
  members: { id: string; label: string }[];
  constraints: { id: string; memberId: string; memberLabel: string; date: string; note: string | null }[];
  canEdit: boolean;
};

function formatDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("it-IT");
}

export function ScheduleMonthlyConstraintsPanel({ scheduleId, year, month, members, constraints, canEdit }: Props) {
  const router = useRouter();
  const { showToast } = useAppToast();
  const [memberId, setMemberId] = useState(members[0]?.id ?? "");
  const [date, setDate] = useState(`${year}-${String(month).padStart(2, "0")}-01`);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const selectedDelete = useMemo(() => constraints.find((c) => c.id === deleteId) ?? null, [constraints, deleteId]);

  async function addConstraint(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit) return;
    setLoading(true);
    const response = await fetch(`/api/schedules/${scheduleId}/monthly-constraints`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberId, date, note }),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      showToast("error", payload.error ?? "Salvataggio non riuscito");
      setLoading(false);
      return;
    }
    setLoading(false);
    setNote("");
    router.refresh();
  }

  async function removeConstraint() {
    if (!deleteId) return;
    setLoading(true);
    await fetch(`/api/monthly-constraints/${deleteId}`, { method: "DELETE" });
    setLoading(false);
    setDeleteId(null);
    router.refresh();
  }

  return (
    <>
      <section className="card">
        <div className="card-body">
          <h2 className="h5 fw-semibold">Nuova indisponibilita mensile</h2>
          <form className="row g-2 align-items-end mt-2" onSubmit={addConstraint}>
            <div className="col-md-4">
              <label className="form-label small mb-1">Persona</label>
              <select className="form-select input-underlined" value={memberId} onChange={(e) => setMemberId(e.target.value)} disabled={!canEdit || loading}>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
            </div>
            <div className="col-md-3">
              <label className="form-label small mb-1">Data</label>
              <input type="date" className="form-control input-underlined" value={date} onChange={(e) => setDate(e.target.value)} disabled={!canEdit || loading} />
            </div>
            <div className="col-md-3">
              <label className="form-label small mb-1">Nota</label>
              <input className="form-control input-underlined" value={note} onChange={(e) => setNote(e.target.value)} disabled={!canEdit || loading} />
            </div>
            <div className="col-md-2 d-flex justify-content-md-end">
              <button className="btn btn-success" type="submit" disabled={!canEdit || loading}>Aggiungi</button>
            </div>
          </form>
        </div>
      </section>

      <section className="card mt-3">
        <div className="card-body">
          <h2 className="h5 fw-semibold">Indisponibilita del mese</h2>
          {constraints.length === 0 ? (
            <p className="text-secondary mb-0">Nessuna indisponibilita inserita.</p>
          ) : (
            <ul className="list-unstyled d-grid gap-2 mt-3">
              {constraints.map((c) => (
                <li key={c.id} className="border rounded p-3 d-flex justify-content-between align-items-center gap-2 flex-wrap">
                  <div>
                    <p className="fw-semibold mb-0">{c.memberLabel}</p>
                    <p className="small text-secondary mb-0">{formatDate(c.date)}{c.note ? ` - ${c.note}` : ""}</p>
                  </div>
                  {canEdit ? (
                    <button className="btn btn-sm btn-outline-danger" onClick={() => setDeleteId(c.id)}>Rimuovi</button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <ConfirmModal
        open={Boolean(deleteId)}
        title="Rimuovi indisponibilita"
        message={selectedDelete ? `Confermi la rimozione per ${selectedDelete.memberLabel} del ${formatDate(selectedDelete.date)}?` : "Confermi la rimozione?"}
        confirmLabel="Rimuovi"
        confirmVariant="danger"
        loading={loading}
        onCancel={() => setDeleteId(null)}
        onConfirm={removeConstraint}
      />
    </>
  );
}
