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
};

type Available = {
  userId: string;
  label: string;
  email: string;
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
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [removeId, setRemoveId] = useState<string | null>(null);

  const filteredAvailable = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return available
      .filter((u) => `${u.label} ${u.email}`.toLowerCase().includes(q))
      .slice(0, 8);
  }, [available, query]);
  const hasQuery = query.trim().length > 0;

  async function addMember(userId: string) {
    if (!canEdit || !userId) return;
    setLoading(true);
    const res = await fetch(`/api/calendars/${calId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    const payload = (await res.json()) as { error?: string };
    setLoading(false);
    if (!res.ok) {
      showToast("error", payload.error ?? "Aggiunta non riuscita");
      return;
    }
    setQuery("");
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
      <p className="small text-secondary mb-2">
        Le persone devono essere membri dell&apos;organizzazione; qui le colleghi solo a questo calendario.
      </p>

      {canEdit && available.length > 0 ? (
        <div className="position-relative mb-3">
          <label className="form-label small mb-1">Aggiungi persona</label>
          <input
            type="text"
            className="form-control form-control-sm input-underlined"
            placeholder="Scrivi nome o email..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={loading}
          />
          {hasQuery && filteredAvailable.length > 0 ? (
            <div
              className="border rounded bg-white shadow-sm"
              style={{
                maxHeight: 220,
                overflowY: "auto",
                position: "absolute",
                top: "calc(100% + 4px)",
                left: 0,
                right: 0,
                zIndex: 30,
              }}
            >
              {filteredAvailable.map((u) => (
                <button
                  key={u.userId}
                  type="button"
                  className="btn btn-link text-start text-decoration-none w-100 px-2 py-1 border-0 border-bottom rounded-0"
                  disabled={loading}
                  onClick={() => void addMember(u.userId)}
                >
                  <span className="small fw-semibold">{u.label}</span>
                  <span className="small text-secondary d-block">{u.email}</span>
                </button>
              ))}
            </div>
          ) : null}
          {hasQuery && filteredAvailable.length === 0 ? (
            <div
              className="border rounded bg-white px-2 py-2 small text-secondary shadow-sm"
              style={{
                position: "absolute",
                top: "calc(100% + 4px)",
                left: 0,
                right: 0,
                zIndex: 30,
              }}
            >
              Nessun risultato. Prova con un altro nome o email.
            </div>
          ) : null}
        </div>
      ) : null}

      {assigned.length === 0 ? (
        <div className="alert alert-light border small mb-2" role="status">
          Nessuna persona associata a questo calendario.
        </div>
      ) : (
        <div className="d-flex flex-wrap gap-2 mb-2">
          {assigned.map((a) => (
            <span
              key={a.calendarMemberId}
              className="btn btn-sm btn-outline-success d-inline-flex align-items-center gap-2 px-3 py-2"
              style={{ borderRadius: 6 }}
            >
              <span className="text-truncate small fw-semibold" style={{ maxWidth: 220 }} title={`${a.label} (${a.email})`}>
                {a.label}
              </span>
              {canEdit ? (
                <button
                  type="button"
                  className="btn-close"
                  aria-label={`Rimuovi ${a.label}`}
                  disabled={loading}
                  style={{
                    width: 14,
                    height: 14,
                    minWidth: 14,
                    minHeight: 14,
                    opacity: 0.75,
                    marginTop: 1,
                  }}
                  onClick={() => setRemoveId(a.calendarMemberId)}
                />
              ) : null}
            </span>
          ))}
        </div>
      )}

      {canEdit && available.length === 0 && assigned.length > 0 ? (
        <p className="small text-secondary mb-0">Tutti i membri dell&apos;organizzazione sono gia in questo calendario.</p>
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
