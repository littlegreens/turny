"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ConfirmModal } from "@/components/confirm-modal";
import { useAppToast } from "@/components/app-toast-provider";

type Assigned = {
  calendarMemberId: string;
  userId: string;
  label: string;
  email: string;
  professionalRole: string;
  memberColor?: string | null;
};

type Available = {
  userId: string;
  label: string;
  email: string;
  memberColor?: string | null;
};

type Props = {
  calId: string;
  canEdit: boolean;
  assigned: Assigned[];
  available: Available[];
};

export function CalendarMembersPanel({ calId, canEdit, assigned, available }: Props) {
  const router = useRouter();
  const { showToast } = useAppToast();

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [modalQuery, setModalQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [selectedToAdd, setSelectedToAdd] = useState<Available[]>([]);

  const filteredAvailable = useMemo(() => {
    const q = modalQuery.trim().toLowerCase();
    if (!q) return [];
    return available.filter((u) => `${u.label} ${u.email}`.toLowerCase().includes(q)).slice(0, 8);
  }, [available, modalQuery]);

  function addCandidate(user: Available) {
    setSelectedToAdd((prev) => (prev.some((x) => x.userId === user.userId) ? prev : [...prev, user]));
    setModalQuery("");
  }

  function removeCandidate(userId: string) {
    setSelectedToAdd((prev) => prev.filter((x) => x.userId !== userId));
  }

  async function addSelectedMembers() {
    if (!canEdit || selectedToAdd.length === 0) return;
    setLoading(true);
    for (const user of selectedToAdd) {
      const res = await fetch(`/api/calendars/${calId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.userId }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { error?: string };
        showToast("error", payload.error ?? "Aggiunta persone non riuscita");
        setLoading(false);
        return;
      }
    }
    setLoading(false);
    setModalQuery("");
    setSelectedToAdd([]);
    setAddModalOpen(false);
    showToast("success", "Persone aggiunte al calendario.");
    router.refresh();
  }

  async function confirmRemove() {
    if (!removeId) return;
    setLoading(true);
    const res = await fetch(`/api/calendar-members/${removeId}`, { method: "DELETE" });
    const payload = (await res.json()) as { error?: string };
    setLoading(false);
    setRemoveId(null);
    if (!res.ok) {
      showToast("error", payload.error ?? "Rimozione non riuscita");
      return;
    }
    router.refresh();
  }

  const removeTarget = assigned.find((a) => a.calendarMemberId === removeId) ?? null;

  return (
    <div>
      <p className="text-secondary mb-2">
        Seleziona le persone che fanno parte di questo calendario.
      </p>

      {assigned.length === 0 ? (
        <>
        <div className="border rounded p-3 mb-2">
          <p className="small text-secondary mb-0">Non ci sono persone associate a questo calendario.</p>
        </div>
        {canEdit ? (
          <div className="mt-3">
            <button type="button" className="btn btn-success" onClick={() => setAddModalOpen(true)} disabled={loading || available.length === 0}>
              Aggiungi persona
            </button>
          </div>
        ) : null}
        </>
      ) : (
        <>
        <div className="mb-4 mt-4">
          <div className="d-flex flex-wrap gap-2">
            {assigned.map((a) => {
              const color = a.memberColor ?? "#1f7a3f";
              return (
                    <span
                  key={a.calendarMemberId}
                  className="text-start d-inline-flex align-items-center gap-2 px-3 py-2"
                      style={{ borderRadius: 6, border: `1px solid ${color}`, backgroundColor: `${color}1f`, color, fontWeight: 600 }}
                >
                  <span className="text-truncate" style={{ maxWidth: 220 }} title={`${a.label} (${a.email})`}>
                    {a.label}
                  </span>
                  {canEdit ? (
                    <button
                      type="button"
                      className="border-0 bg-transparent p-0 lh-1"
                      aria-label={`Rimuovi ${a.label}`}
                      disabled={loading}
                      style={{ color, fontSize: 16, lineHeight: 1, opacity: 0.95 }}
                      onClick={() => setRemoveId(a.calendarMemberId)}
                    >
                      ×
                    </button>
                  ) : null}
                </span>
              );
            })}
          </div>
        </div>
        {canEdit ? (
          <div className="mt-3">
            <button type="button" className="btn btn-success" onClick={() => setAddModalOpen(true)} disabled={loading || available.length === 0}>
              Aggiungi persona
            </button>
          </div>
        ) : null}
        </>
      )}

      {addModalOpen ? (
        <>
          <div className="modal fade show d-block" tabIndex={-1} role="dialog" aria-modal="true" style={{ zIndex: 1050 }}>
            <div className="modal-dialog modal-dialog-centered turny-modal-medium">
              <div className="modal-content turny-modal">
                <div className="modal-header">
                  <h5 className="modal-title">Aggiungi persona</h5>
                  <button type="button" className="btn-close" aria-label="Chiudi" onClick={() => setAddModalOpen(false)} />
                </div>
                <div className="modal-body">
                  <label className="form-label mb-1">Nome o email</label>
                  <input
                    type="text"
                    className="form-control input-underlined mb-2"
                    placeholder="Scrivi nome o email..."
                    value={modalQuery}
                    onChange={(e) => setModalQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && filteredAvailable.length > 0) {
                        e.preventDefault();
                        addCandidate(filteredAvailable[0]);
                      }
                    }}
                    disabled={loading}
                    autoFocus
                  />

                  {modalQuery.trim().length > 0 ? (
                    filteredAvailable.length > 0 ? (
                      <div className="border rounded mb-3">
                        {filteredAvailable.map((u) => (
                          <button
                            key={u.userId}
                            type="button"
                            className="w-100 text-start border-0 bg-white px-3 py-2"
                            style={{ borderBottom: "1px solid #eef2f3" }}
                            onClick={() => addCandidate(u)}
                          >
                            <span className="fw-semibold d-block">{u.label}</span>
                            <span className="text-secondary">{u.email}</span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="border rounded p-2 text-secondary mb-3">Nessun risultato.</div>
                    )
                  ) : null}

                  {selectedToAdd.length > 0 ? (
                    <div className="d-flex flex-wrap gap-2">
                      {selectedToAdd.map((u) => {
                        const color = u.memberColor ?? "#1f7a3f";
                        return (
                          <span
                            key={u.userId}
                            className="text-start d-inline-flex align-items-center gap-2 px-3 py-2"
                            style={{ border: `1px solid ${color}`, backgroundColor: `${color}1f`, color, fontWeight: 600 }}
                          >
                            <span>{u.label}</span>
                            <button
                              type="button"
                              className="border-0 bg-transparent p-0 lh-1"
                              aria-label={`Rimuovi ${u.label}`}
                              onClick={() => removeCandidate(u.userId)}
                              style={{ color, fontSize: 16, lineHeight: 1, opacity: 0.95 }}
                            >
                              ×
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
                <div className="modal-footer d-flex justify-content-between">
                  <button type="button" className="btn btn-outline-secondary" onClick={() => setAddModalOpen(false)} disabled={loading}>
                    Annulla
                  </button>
                  <button type="button" className="btn btn-success" onClick={() => void addSelectedMembers()} disabled={loading || selectedToAdd.length === 0}>
                    {loading ? "Salvataggio..." : "Salva"}
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div role="presentation" onClick={() => setAddModalOpen(false)} style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.06)", zIndex: 1040 }} />
        </>
      ) : null}

      <ConfirmModal
        open={removeId !== null}
        title="Rimuovi dal calendario"
        message={
          removeTarget
            ? `Rimuovere ${removeTarget.label} da questo calendario? Non resterà assegnata ai turni di questo calendario.`
            : ""
        }
        confirmLabel="Rimuovi"
        cancelLabel="Annulla"
        confirmVariant="danger"
        loading={loading}
        onCancel={() => setRemoveId(null)}
        onConfirm={() => void confirmRemove()}
      />
    </div>
  );
}

