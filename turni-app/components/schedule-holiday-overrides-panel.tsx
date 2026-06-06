"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppToast } from "@/components/app-toast-provider";
import type { HolidayOverrideDraft, HolidayOverrideMode } from "@/lib/holiday-overrides";
import { sundayShiftTypeIds as defaultSundayShiftIds } from "@/lib/holiday-overrides";

type ShiftOpt = { id: string; name: string; activeWeekdays: number[] };

type Props = {
  scheduleId: string;
  canEdit: boolean;
  initialScheduleRules: unknown;
  shiftTypes: ShiftOpt[];
};

type FormKind = "festivo" | "eccezione";

function normalizeRows(initialScheduleRules: unknown, shiftTypes: ShiftOpt[]): HolidayOverrideDraft[] {
  const raw = (initialScheduleRules ?? {}) as { holidayOverrides?: unknown };
  const list = Array.isArray(raw.holidayOverrides) ? raw.holidayOverrides : [];

  const sundayShiftTypeIds = shiftTypes.filter((st) => st.activeWeekdays.includes(0)).map((st) => st.id);

  return list
    .filter((r): r is Record<string, unknown> => Boolean(r && typeof r === "object"))
    .map((r) => {
      const modeRaw = String(r.mode ?? "SUNDAY_LIKE").toUpperCase();
      const mode: HolidayOverrideMode =
        modeRaw === "FESTIVO" ? "FESTIVO" : modeRaw === "CLOSED" ? "FESTIVO" : "CUSTOM";
      const st = r.shiftTypeIds;
      const shiftTypeIds =
        mode === "FESTIVO"
          ? Array.isArray(st) && st.length
            ? st.map(String).filter(Boolean)
            : sundayShiftTypeIds
          : modeRaw === "CUSTOM"
            ? (Array.isArray(st) ? st.map(String).filter(Boolean) : undefined)
            : sundayShiftTypeIds;
      const date = String(r.date ?? "").slice(0, 10);
      const rawId = String(r.id || "").trim();
      return {
        id: rawId || (date ? `h-${date}` : `h-${Date.now()}`),
        date,
        mode,
        ...(shiftTypeIds?.length ? { shiftTypeIds } : {}),
      };
    })
    .filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date));
}

function rowSummary(r: HolidayOverrideDraft, shiftTypes: ShiftOpt[]): string {
  const names = (r.shiftTypeIds ?? [])
    .map((id) => shiftTypes.find((s) => s.id === id)?.name ?? id)
    .join(", ");
  const kind = r.mode === "FESTIVO" ? "Festivo" : "Eccezione";
  return names ? `${kind} · ${names}` : kind;
}

export function ScheduleHolidayOverridesPanel({ scheduleId, canEdit, initialScheduleRules, shiftTypes }: Props) {
  const router = useRouter();
  const { showToast } = useAppToast();
  const [loading, setLoading] = useState(false);

  const [rows, setRows] = useState<HolidayOverrideDraft[]>(() => normalizeRows(initialScheduleRules, shiftTypes));
  const sundayShiftTypeIds = useMemo(() => shiftTypes.filter((st) => st.activeWeekdays.includes(0)).map((st) => st.id), [shiftTypes]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [formDate, setFormDate] = useState("");
  const [formKind, setFormKind] = useState<FormKind>("eccezione");
  const [formShiftIds, setFormShiftIds] = useState<string[]>(() => sundayShiftTypeIds);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  function newId() {
    if (typeof globalThis.crypto !== "undefined" && "randomUUID" in globalThis.crypto) {
      return globalThis.crypto.randomUUID();
    }
    return `h-${Date.now()}`;
  }

  const sorted = useMemo(() => [...rows].sort((a, b) => a.date.localeCompare(b.date)), [rows]);

  async function persist(next: HolidayOverrideDraft[]) {
    setLoading(true);
    try {
      const res = await fetch(`/api/schedules/${scheduleId}/holiday-overrides`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          holidayOverrides: next.map((r) => ({
            id: r.id,
            date: r.date,
            mode: r.mode,
            ...(r.shiftTypeIds?.length ? { shiftTypeIds: r.shiftTypeIds } : {}),
          })),
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        showToast("error", payload.error ?? `Errore ${res.status}`);
        return false;
      }
      setRows(next);
      showToast("success", "Festivi salvati.");
      router.refresh();
      return true;
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Errore salvataggio");
      return false;
    } finally {
      setLoading(false);
    }
  }

  function openNew() {
    setEditId(null);
    setFormDate("");
    setFormKind("eccezione");
    setFormShiftIds(sundayShiftTypeIds);
    setModalOpen(true);
  }

  function openEdit(r: HolidayOverrideDraft) {
    setEditId(r.id);
    setFormDate(r.date);
    if (r.mode === "FESTIVO") {
      setFormKind("festivo");
      setFormShiftIds([...(r.shiftTypeIds ?? [])]);
    } else {
      setFormKind("eccezione");
      setFormShiftIds([...(r.shiftTypeIds ?? [])]);
    }
    setModalOpen(true);
  }

  function toggleShift(id: string) {
    setFormShiftIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  function buildRow(id: string, date: string): HolidayOverrideDraft {
    const shiftTypeIds = formShiftIds.length ? [...formShiftIds] : [...sundayShiftTypeIds];
    if (formKind === "festivo") {
      return { id, date, mode: "FESTIVO", shiftTypeIds };
    }
    return { id, date, mode: "CUSTOM", shiftTypeIds };
  }

  return (
    <>
      {sorted.length === 0 ? (
        <div className="small text-secondary border rounded p-2">
          Nessun giorno eccezionale configurato.
        </div>
      ) : (
        <ul className="list-unstyled mb-0 d-grid gap-2">
          {sorted.map((r) => (
            <li key={r.id} className="border rounded p-2 d-flex justify-content-between align-items-start gap-2 flex-wrap">
              <div>
                <div className="fw-semibold small">{r.date}</div>
                <div className="small text-secondary">{rowSummary(r, shiftTypes)}</div>
              </div>
              {canEdit ? (
                <div className="d-flex gap-1">
                  <button type="button" className="btn btn-sm btn-outline-secondary" disabled={loading} onClick={() => openEdit(r)}>
                    Modifica
                  </button>
                  <button type="button" className="btn btn-sm btn-danger turny-btn-action" disabled={loading} onClick={() => setDeleteId(r.id)}>
                    Elimina
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canEdit ? (
        <div className="mt-3">
          <button type="button" className="btn btn-sm btn-success" disabled={loading} onClick={openNew}>
            Aggiungi data
          </button>
        </div>
      ) : null}

      {modalOpen ? (
        <>
          <div className="modal fade show d-block" style={{ zIndex: 1050 }} tabIndex={-1} role="dialog" aria-modal="true">
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content turny-modal">
                <div className="modal-header py-2">
                  <h5 className="modal-title">{editId ? "Modifica giorno" : "Nuovo giorno eccezionale"}</h5>
                  <button type="button" className="btn-close" aria-label="Chiudi" onClick={() => setModalOpen(false)} />
                </div>
                <div className="modal-body">
                  <label className="form-label small fw-semibold mb-1 text-secondary">Data (ISO)</label>
                  <input
                    type="date"
                    className="form-control form-control-sm mb-3"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                  />

                  <div className="d-flex gap-3 mb-3">
                    <label className="member-popup-field-row mb-0">
                      <input
                        type="radio"
                        className="form-check-input me-1"
                        name="holiday-form-kind"
                        checked={formKind === "festivo"}
                        onChange={() => setFormKind("festivo")}
                      />
                      <span className="small fw-bold">Festivo</span>
                    </label>
                    <label className="member-popup-field-row mb-0">
                      <input
                        type="radio"
                        className="form-check-input me-1"
                        name="holiday-form-kind"
                        checked={formKind === "eccezione"}
                        onChange={() => setFormKind("eccezione")}
                      />
                      <span className="small fw-bold">Eccezione</span>
                    </label>
                  </div>

                  <div className="small fw-semibold mb-3 text-secondary">Turni attivi quel giorno</div>
                  <div className="d-flex flex-wrap gap-2">
                    {shiftTypes.map((st) => {
                      const active = formShiftIds.includes(st.id);
                      return (
                        <button
                          key={st.id}
                          type="button"
                          className={`btn btn-sm schedule-member-popup-tile ${active ? "btn-success" : "btn-outline-secondary"}`}
                          onClick={() => toggleShift(st.id)}
                        >
                          {st.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="modal-footer turny-modal-footer-split">
                  <button type="button" className="btn btn-outline-secondary" onClick={() => setModalOpen(false)}>
                    Annulla
                  </button>
                  <button
                    type="button"
                    className="btn btn-success turny-btn-action"
                    disabled={loading || !canEdit || !/^\d{4}-\d{2}-\d{2}$/.test(formDate)}
                    onClick={() => {
                      const id = editId ?? newId();
                      const nextRow = buildRow(id, formDate);
                      const next = editId
                        ? rows.map((r) => (r.id === editId ? nextRow : r))
                        : [...rows.filter((r) => r.date !== formDate), nextRow];

                      void (async () => {
                        const ok = await persist(next);
                        if (ok) setModalOpen(false);
                      })();
                    }}
                  >
                    Salva
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="modal-backdrop fade show" style={{ zIndex: 1040 }} aria-hidden />
        </>
      ) : null}

      {deleteId ? (
        <div className="modal fade show d-block" style={{ zIndex: 1060 }} tabIndex={-1} role="dialog">
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content turny-modal">
              <div className="modal-body">Rimuovere questa data eccezionale?</div>
              <div className="modal-footer turny-modal-footer-split">
                <button type="button" className="btn btn-outline-secondary" onClick={() => setDeleteId(null)}>
                  Annulla
                </button>
                <button
                  type="button"
                  className="btn btn-danger turny-btn-action"
                  disabled={loading}
                  onClick={() => {
                    const id = deleteId;
                    setDeleteId(null);
                    void persist(rows.filter((r) => r.id !== id));
                  }}
                >
                  Elimina
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
