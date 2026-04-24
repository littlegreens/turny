"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAppToast } from "@/components/app-toast-provider";
import { ConfirmModal } from "@/components/confirm-modal";

type Props = {
  orgSlug: string;
  schedule: {
    id: string;
    calendarId: string;
    calendarName: string;
    calendarColor: string;
    year: number;
    month: number;
    status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
    generationLog: unknown;
  };
  canEdit: boolean;
};

function colorWithAlpha(hex: string, alphaHex = "1f") {
  return /^#[0-9A-Fa-f]{6}$/.test(hex) ? `${hex}${alphaHex}` : "#1f7a3f1f";
}

function monthName(month: number) {
  const monthLabel = new Intl.DateTimeFormat("it-IT", { month: "long" }).format(new Date(2026, month - 1, 1));
  return monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);
}

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, idx) => {
  const value = idx + 1;
  return { value, label: monthName(value) };
});

type PeriodFromLog =
  | { type: "WEEKLY" | "CUSTOM"; startDate: string; endDate: string; turnName: string }
  | { type: "MONTHLY"; year: number; month: number; turnName: string };

function periodFromLog(schedule: Props["schedule"]): PeriodFromLog {
  const meta = (schedule.generationLog ?? {}) as { periodType?: string; startDate?: string; endDate?: string; turnName?: string };
  const pt = meta.periodType;
  if (pt === "WEEKLY" || pt === "CUSTOM") {
    return {
      type: pt,
      startDate: meta.startDate ?? "",
      endDate: meta.endDate ?? "",
      turnName: meta.turnName?.trim() ?? "",
    };
  }
  return { type: "MONTHLY", year: schedule.year, month: schedule.month, turnName: meta.turnName?.trim() ?? "" };
}

function periodLabel(schedule: Props["schedule"]) {
  const p = periodFromLog(schedule);
  if (p.type === "MONTHLY") return monthName(schedule.month);
  return `Dal ${formatDateIt(p.startDate)} al ${formatDateIt(p.endDate)}`;
}

function formatDateIt(isoDate: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return isoDate || "-";
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
}

function statusLabel(status: Props["schedule"]["status"]) {
  if (status === "DRAFT") return "Bozza";
  if (status === "PUBLISHED") return "Pubblicato";
  return "Archiviato";
}

function addDays(dateIso: string, days: number) {
  const d = new Date(`${dateIso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function OrgTurnListItem({ orgSlug, schedule, canEdit }: Props) {
  const router = useRouter();
  const { showToast } = useAppToast();
  const initial = periodFromLog(schedule);
  const [editing, setEditing] = useState(false);
  const [periodType, setPeriodType] = useState<"MONTHLY" | "WEEKLY" | "CUSTOM">(initial.type as "MONTHLY" | "WEEKLY" | "CUSTOM");
  const [year, setYear] = useState(schedule.year);
  const [month, setMonth] = useState(schedule.month);
  const [startDate, setStartDate] = useState("startDate" in initial ? (initial.startDate ?? "") : "");
  const [endDate, setEndDate] = useState("endDate" in initial ? (initial.endDate ?? "") : "");
  const [turnName, setTurnName] = useState(initial.turnName || "");
  const [status, setStatus] = useState<"DRAFT" | "PUBLISHED" | "ARCHIVED">(schedule.status);
  const [saving, setSaving] = useState(false);
  const [confirmPublishOpen, setConfirmPublishOpen] = useState(false);
  const [confirmArchiveOpen, setConfirmArchiveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function save() {
    try {
      setSaving(true);
      const endResolved = periodType === "WEEKLY" && startDate ? addDays(startDate, 6) : endDate;
      const requestBody: Record<string, unknown> = {
        status,
        periodType,
        turnName: turnName.trim(),
      };
      if (periodType === "MONTHLY") {
        requestBody.year = Number(year);
        requestBody.month = Number(month);
      } else {
        if (startDate) requestBody.startDate = startDate;
        if (endResolved) requestBody.endDate = endResolved;
      }
      const response = await fetch(`/api/schedules/${schedule.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        showToast("error", result.error ?? "Salvataggio non riuscito");
        return;
      }
      setEditing(false);
      setConfirmPublishOpen(false);
      setConfirmArchiveOpen(false);
      showToast("success", "Turno aggiornato.");
      router.refresh();
    } catch {
      showToast("error", "Errore di rete durante il salvataggio");
    } finally {
      setSaving(false);
    }
  }

  function handleSaveClick() {
    if (status === "PUBLISHED") {
      setConfirmPublishOpen(true);
      return;
    }
    if (status === "ARCHIVED") {
      setConfirmArchiveOpen(true);
      return;
    }
    void save();
  }

  async function remove() {
    setDeleting(true);
    const response = await fetch(`/api/schedules/${schedule.id}`, { method: "DELETE" });
    setDeleting(false);
    setDeleteOpen(false);
    if (response.ok) router.refresh();
  }

  return (
    <li className="rounded p-3" style={{ border: `1px solid ${schedule.calendarColor}`, backgroundColor: colorWithAlpha(schedule.calendarColor) }}>
      <div className="d-flex justify-content-between align-items-center gap-2 flex-wrap">
        <div>
          <p className="fw-semibold mb-0">{initial.turnName || "Turno senza nome"}</p>
          <p className="small text-secondary mb-0">Periodo: {periodLabel(schedule)}</p>
          <p className="small text-secondary mb-0">Stato: {statusLabel(schedule.status)}</p>
        </div>
        <div className="d-flex gap-2">
          <Link className="btn btn-sm btn-success" href={`/${orgSlug}/${schedule.calendarId}/schedules/${schedule.id}/grid`}>
            Configura
          </Link>
          {canEdit ? (
            <>
              <button className="btn btn-sm btn-outline-secondary" onClick={() => setEditing(true)}>
                Modifica
              </button>
              <button className="btn btn-sm btn-outline-danger" onClick={() => setDeleteOpen(true)}>
                Elimina
              </button>
            </>
          ) : null}
        </div>
      </div>

      {editing ? (
        <>
          <div className="modal fade show d-block" tabIndex={-1} role="dialog" aria-modal="true">
            <div className="modal-dialog modal-dialog-centered turny-modal-medium">
              <div className="modal-content turny-modal">
                <div className="modal-header">
                  <h5 className="modal-title">Modifica turno</h5>
                  <button type="button" className="btn-close" aria-label="Chiudi" onClick={() => setEditing(false)} />
                </div>
                <div className="modal-body pb-4">
                  <div className="row g-2 align-items-end">
                    <div className="col-12">
                      <label className="form-label small mb-1">Nome turno</label>
                      <input
                        className="form-control input-underlined"
                        value={turnName}
                        onChange={(e) => setTurnName(e.target.value)}
                        disabled={saving}
                        required
                      />
                    </div>
                    <div className="col-md-4">
                      <label className="form-label small mb-1">Periodo</label>
                      <select className="form-select input-underlined" value={periodType} onChange={(e) => setPeriodType(e.target.value as "MONTHLY" | "WEEKLY" | "CUSTOM")} disabled={saving}>
                        <option value="MONTHLY">Mensile</option>
                        <option value="WEEKLY">Settimanale</option>
                        <option value="CUSTOM">Personalizzato</option>
                      </select>
                    </div>
                    {periodType === "MONTHLY" ? (
                      <>
                        <div className="col-md-4">
                          <label className="form-label small mb-1">Anno</label>
                          <input type="number" className="form-control input-underlined" value={year} onChange={(e) => setYear(Number(e.target.value))} disabled={saving} />
                        </div>
                        <div className="col-md-4">
                          <label className="form-label small mb-1">Mese</label>
                          <select className="form-select input-underlined" value={month} onChange={(e) => setMonth(Number(e.target.value))} disabled={saving}>
                            {MONTH_OPTIONS.map((m) => (
                              <option key={m.value} value={m.value}>{m.label}</option>
                            ))}
                          </select>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="col-md-4">
                          <label className="form-label small mb-1">Data inizio</label>
                          <input type="date" className="form-control input-underlined" value={startDate} onChange={(e) => setStartDate(e.target.value)} disabled={saving} />
                        </div>
                        <div className="col-md-4">
                          <label className="form-label small mb-1">Data fine</label>
                          <input type="date" className="form-control input-underlined" value={periodType === "WEEKLY" && startDate ? addDays(startDate, 6) : endDate} onChange={(e) => setEndDate(e.target.value)} disabled={saving || periodType === "WEEKLY"} />
                        </div>
                      </>
                    )}
                    <div className="col-md-4">
                      <label className="form-label small mb-1">Stato</label>
                      <select className="form-select input-underlined" value={status} onChange={(e) => setStatus(e.target.value as "DRAFT" | "PUBLISHED" | "ARCHIVED")} disabled={saving}>
                        <option value="DRAFT">Bozza</option>
                        <option value="PUBLISHED">Pubblicato</option>
                        <option value="ARCHIVED">Archiviato</option>
                      </select>
                    </div>
                    <div className="col-12 d-flex justify-content-end gap-2">
                      <button className="btn btn-outline-secondary" onClick={() => setEditing(false)} disabled={saving}>Annulla</button>
                      <button className="btn btn-success" onClick={handleSaveClick} disabled={saving || !turnName.trim()}>{saving ? "Salvataggio..." : "Salva modifiche"}</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div onClick={() => setEditing(false)} style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.06)", zIndex: 1040 }} />
        </>
      ) : null}

      <ConfirmModal
        open={confirmPublishOpen}
        title="Pubblica turno"
        message="Confermi la pubblicazione del turno?"
        confirmLabel="Pubblica"
        cancelLabel="Annulla"
        confirmVariant="success"
        loading={saving}
        onCancel={() => setConfirmPublishOpen(false)}
        onConfirm={() => void save()}
      />
      <ConfirmModal
        open={confirmArchiveOpen}
        title="Archivia turno"
        message="Confermi l'archiviazione del turno?"
        confirmLabel="Archivia"
        cancelLabel="Annulla"
        confirmVariant="primary"
        loading={saving}
        onCancel={() => setConfirmArchiveOpen(false)}
        onConfirm={() => void save()}
      />
      <ConfirmModal
        open={deleteOpen}
        title="Elimina turno"
        message="Confermi l'eliminazione del turno?"
        confirmLabel="Elimina"
        confirmVariant="danger"
        loading={deleting}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={remove}
      />
    </li>
  );
}

