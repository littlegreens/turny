"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppToast } from "@/components/app-toast-provider";
import type { HolidayOverrideDraft, HolidayOverrideMode } from "@/lib/holiday-overrides";

const MODE_LABELS: Record<HolidayOverrideMode, string> = {
  CLOSED: "Chiuso — nessun turno",
  SUNDAY_LIKE: "Solo fasce selezionate",
  CUSTOM: "Solo fasce selezionate",
};

type ShiftOpt = { id: string; name: string; activeWeekdays: number[] };

type Props = {
  calId: string;
  canEdit: boolean;
  initialCalendarRules: unknown;
  shiftTypes: ShiftOpt[];
};

export function CalendarHolidayOverridesPanel({ calId, canEdit, initialCalendarRules, shiftTypes }: Props) {
  const router = useRouter();
  const { showToast } = useAppToast();
  const [loading, setLoading] = useState(false);

  const [rows, setRows] = useState<HolidayOverrideDraft[]>(() => {
    const raw = (initialCalendarRules ?? {}) as { holidayOverrides?: unknown };
    const list = Array.isArray(raw.holidayOverrides) ? raw.holidayOverrides : [];
    return list
      .filter((r): r is Record<string, unknown> => Boolean(r && typeof r === "object"))
      .map((r) => {
        const modeRaw = String(r.mode ?? "SUNDAY_LIKE").toUpperCase();
        const sundayShiftTypeIds = shiftTypes.filter((st) => st.activeWeekdays.includes(0)).map((st) => st.id);
        const mode: HolidayOverrideMode = modeRaw === "CLOSED" ? "CLOSED" : "CUSTOM";
        const st = r.shiftTypeIds;
        const shiftTypeIds =
          mode === "CUSTOM"
            ? modeRaw === "CUSTOM"
              ? (Array.isArray(st) ? st.map(String).filter(Boolean) : undefined)
              : sundayShiftTypeIds
            : undefined;
        return {
          id: String(r.id || ""),
          date: String(r.date ?? "").slice(0, 10),
          mode,
          ...(mode === "CUSTOM" && shiftTypeIds?.length ? { shiftTypeIds } : {}),
        };
      })
      .filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date));
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [formDate, setFormDate] = useState("");
  const [formMode, setFormMode] = useState<HolidayOverrideMode>("CLOSED");
  const [formShiftIds, setFormShiftIds] = useState<string[]>([]);
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
      const prev = (initialCalendarRules ?? {}) as Record<string, unknown>;
      const res = await fetch(`/api/calendars/${calId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rules: {
            ...prev,
            holidayOverrides: next.map((r) => ({
              id: r.id,
              date: r.date,
              mode: r.mode,
              ...(r.mode === "CUSTOM" && r.shiftTypeIds?.length ? { shiftTypeIds: r.shiftTypeIds } : {}),
            })),
          },
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
    setFormMode("CLOSED");
    setFormShiftIds([]);
    setModalOpen(true);
  }

  function openEdit(r: HolidayOverrideDraft) {
    setEditId(r.id);
    setFormDate(r.date);
    setFormMode(r.mode);
    setFormShiftIds(r.mode === "CUSTOM" ? [...(r.shiftTypeIds ?? [])] : []);
    setModalOpen(true);
  }

  function toggleShift(id: string) {
    setFormShiftIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  return (
    <>
      <div className="d-flex justify-content-end align-items-start flex-wrap gap-2 mb-2">
        {canEdit ? (
          <button type="button" className="btn btn-sm btn-success" disabled={loading} onClick={openNew}>
            Aggiungi data
          </button>
        ) : null}
      </div>

      {sorted.length === 0 ? (
        <div className="small text-secondary border rounded p-2">Nessun giorno eccezionale configurato.</div>
      ) : (
        <ul className="list-unstyled mb-0 d-grid gap-2">
          {sorted.map((r) => (
            <li key={r.id} className="border rounded p-2 d-flex justify-content-between align-items-start gap-2 flex-wrap">
              <div>
                <div className="fw-semibold small">{r.date}</div>
                <div className="small text-secondary">{MODE_LABELS[r.mode]}</div>
                {r.mode === "CUSTOM" && r.shiftTypeIds?.length ? (
                  <div className="small mt-1">
                    {r.shiftTypeIds.map((id) => shiftTypes.find((s) => s.id === id)?.name ?? id).join(", ")}
                  </div>
                ) : null}
              </div>
              {canEdit ? (
                <div className="d-flex gap-1">
                  <button type="button" className="btn btn-sm btn-outline-secondary" disabled={loading} onClick={() => openEdit(r)}>
                    Modifica
                  </button>
                  <button type="button" className="btn btn-sm btn-outline-danger" disabled={loading} onClick={() => setDeleteId(r.id)}>
                    Elimina
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

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
                  <label className="form-label small fw-semibold mb-1 text-secondary">Comportamento</label>
                  <select
                    className="form-select form-select-sm mb-3"
                    value={formMode}
                    onChange={(e) => setFormMode(e.target.value as HolidayOverrideMode)}
                  >
                    {(["CLOSED", "CUSTOM"] as HolidayOverrideMode[]).map((m) => (
                      <option key={m} value={m}>
                        {MODE_LABELS[m]}
                      </option>
                    ))}
                  </select>
                  {formMode === "CUSTOM" ? (
                    <div>
                      <div className="small fw-semibold mb-1 text-secondary">Fasce attive quel giorno</div>
                      <div className="d-flex flex-wrap gap-2">
                        {shiftTypes.map((st) => (
                          <button
                            key={st.id}
                            type="button"
                            className={`btn btn-sm ${formShiftIds.includes(st.id) ? "btn-success" : "btn-outline-secondary"}`}
                            onClick={() => toggleShift(st.id)}
                          >
                            {st.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
                <div className="modal-footer py-2">
                  <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => setModalOpen(false)}>
                    Annulla
                  </button>
                  <button
                    type="button"
                    className="btn btn-success btn-sm"
                    disabled={
                      loading ||
                      !canEdit ||
                      !/^\d{4}-\d{2}-\d{2}$/.test(formDate) ||
                      (formMode === "CUSTOM" && formShiftIds.length === 0)
                    }
                    onClick={() => {
                      const id = editId ?? newId();
                      const nextRow: HolidayOverrideDraft =
                        formMode === "CUSTOM"
                          ? { id, date: formDate, mode: "CUSTOM", shiftTypeIds: [...formShiftIds] }
                          : { id, date: formDate, mode: formMode };
                      const next = editId ? rows.map((r) => (r.id === editId ? nextRow : r)) : [...rows.filter((r) => r.date !== formDate), nextRow];
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
              <div className="modal-footer py-2">
                <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => setDeleteId(null)}>
                  Annulla
                </button>
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
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
