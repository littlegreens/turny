"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { type DragEvent, useState } from "react";
import { ConfirmModal } from "@/components/confirm-modal";
import { ColorPalettePicker } from "@/components/color-palette-picker";
import { formatWeekdays } from "@/lib/weekdays";
import { WEEKDAY_OPTIONS } from "@/lib/weekdays";

type Props = {
  shiftType: {
    id: string;
    name: string;
    startTime: string;
    endTime: string;
    durationHours: number;
    minStaff: number;
    color: string;
    activeWeekdays: number[];
    rules?: unknown;
  };
  canEdit: boolean;
  roleOptions?: string[];
  canReorder?: boolean;
  isDragging?: boolean;
  onDragStart?: () => void;
  onDragOver?: (event: DragEvent<HTMLLIElement>) => void;
  onDrop?: () => void;
  onDragEnd?: () => void;
};

function colorWithAlpha(hex: string, alphaHex = "1f") {
  return /^#[0-9A-Fa-f]{6}$/.test(hex) ? `${hex}${alphaHex}` : "#1f7a3f1f";
}

export function ShiftTypeItem({
  shiftType,
  canEdit,
  roleOptions = [],
  canReorder = false,
  isDragging = false,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(shiftType.name);
  const [startTime, setStartTime] = useState(shiftType.startTime);
  const [endTime, setEndTime] = useState(shiftType.endTime);
  const [minStaff, setMinStaff] = useState(shiftType.minStaff);
  const [color, setColor] = useState(shiftType.color);
  const [activeWeekdays, setActiveWeekdays] = useState<number[]>(shiftType.activeWeekdays ?? [1, 2, 3, 4, 5]);
  const [roleSlots, setRoleSlots] = useState<Array<string | null>>(() => {
    const r = shiftType.rules as { roleSlots?: Array<string | null> } | null | undefined;
    const slots = Array.isArray(r?.roleSlots) ? r!.roleSlots : [];
    return Array.from({ length: Math.max(1, shiftType.minStaff) }, (_, i) => slots[i] ?? null);
  });
  const [saving, setSaving] = useState(false);
  const [weekdaysOpen, setWeekdaysOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const weekdayRows = [
    [1, 2, 3],
    [4, 5, 6],
    [0],
  ];

  function toggleWeekday(day: number) {
    if (activeWeekdays.includes(day)) {
      if (activeWeekdays.length === 1) return;
      setActiveWeekdays(activeWeekdays.filter((v) => v !== day));
      return;
    }
    setActiveWeekdays([...activeWeekdays, day]);
  }

  async function save() {
    setSaving(true);
    await fetch(`/api/shift-types/${shiftType.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        startTime,
        endTime,
        minStaff,
        color,
        activeWeekdays,
        rules: {
          ...(typeof shiftType.rules === "object" && shiftType.rules ? (shiftType.rules as Record<string, unknown>) : {}),
          roleSlots: Array.from({ length: Math.max(1, minStaff) }, (_, i) => roleSlots[i] ?? null),
        },
      }),
    });
    setSaving(false);
    setEditing(false);
    router.refresh();
  }

  async function remove() {
    setDeleting(true);
    await fetch(`/api/shift-types/${shiftType.id}`, { method: "DELETE" });
    setDeleting(false);
    setDeleteOpen(false);
    router.refresh();
  }

  return (
    <li
      className="rounded p-3"
      style={{ border: `1px solid ${shiftType.color}`, backgroundColor: colorWithAlpha(shiftType.color), opacity: isDragging ? 0.65 : 1 }}
      draggable={canReorder}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      <div className="d-flex justify-content-between align-items-center">
        <div className="d-flex align-items-center gap-2">
          {canReorder ? (
            <span className="text-secondary" style={{ cursor: "grab", userSelect: "none", fontSize: 18, lineHeight: 1 }} aria-hidden="true" title="Trascina per ordinare">
              ⋮⋮
            </span>
          ) : null}
          <div>
          <p className="fw-semibold mb-0">{shiftType.name}</p>
          <p className="small text-secondary mb-0">
            {shiftType.startTime} - {shiftType.endTime} ({shiftType.durationHours}h)
          </p>
          <p className="small text-secondary mb-0">
            {formatWeekdays(shiftType.activeWeekdays ?? [1, 2, 3, 4, 5])}
          </p>
          </div>
        </div>
        <div className="d-flex align-items-center gap-2">
          <span className="small text-secondary">min staff: {shiftType.minStaff}</span>
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
                <div className="modal-body pb-3">
                  <div className="row g-2 align-items-end">
                    <div className="col-12 col-md-6">
                      <label className="form-label small mb-1">Nome</label>
                      <input className="form-control form-control-sm input-underlined input-underlined-compact" value={name} onChange={(e) => setName(e.target.value)} />
                    </div>
                    <div className="col-6 col-md-3">
                      <label className="form-label small mb-1">Inizio</label>
                      <input type="time" className="form-control form-control-sm input-underlined input-underlined-compact" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                    </div>
                    <div className="col-6 col-md-3">
                      <label className="form-label small mb-1">Fine</label>
                      <input type="time" className="form-control form-control-sm input-underlined input-underlined-compact" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
                    </div>
                    <div className="col-6 col-md-3">
                      <label className="form-label small mb-1">Min staff</label>
                      <input
                        type="number"
                        min={1}
                        className="form-control form-control-sm input-underlined input-underlined-compact"
                        value={minStaff}
                        onChange={(e) => {
                          const v = Math.max(1, Math.floor(Number(e.target.value) || 1));
                          setMinStaff(v);
                          setRoleSlots((prev) => Array.from({ length: v }, (_, i) => prev[i] ?? null));
                        }}
                      />
                    </div>
                    <div className="col-6 col-md-3">
                      <ColorPalettePicker value={color} onChange={setColor} label="Colore" />
                    </div>
                    <div className="col-12">
                      <label className="form-label small mb-1">Ruoli per slot</label>
                      <div className="d-grid gap-2">
                        {Array.from({ length: Math.max(1, minStaff) }, (_, i) => (
                          <div key={i} className="d-flex align-items-center gap-2">
                            <span className="small text-secondary" style={{ minWidth: 64 }}>
                              Slot {i + 1}
                            </span>
                            <select
                              className="form-select form-select-sm input-underlined input-underlined-compact"
                              value={roleSlots[i] ?? ""}
                              onChange={(e) => {
                                const next = e.target.value ? e.target.value : null;
                                setRoleSlots((prev) => {
                                  const out = Array.from({ length: Math.max(1, minStaff) }, (_, j) => prev[j] ?? null);
                                  out[i] = next;
                                  return out;
                                });
                              }}
                            >
                              <option value="">Indifferente</option>
                              {roleOptions.map((r) => (
                                <option key={r} value={r}>
                                  {r}
                                </option>
                              ))}
                            </select>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="col-12 col-md-6 position-relative">
                      <label className="form-label small mb-1 d-block">Giorni attivi</label>
                      <button className="btn btn-sm btn-outline-success" type="button" onClick={() => setWeekdaysOpen((v) => !v)}>
                        <Image src="/calendar.svg" alt="Giorni turno" width={16} height={16} />
                      </button>
                      {weekdaysOpen ? (
                        <div className="weekdays-popover-dark">
                          {weekdayRows.map((row, rowIdx) => (
                            <div key={rowIdx} className="weekday-mini-row">
                              {row.map((day) => {
                                const item = WEEKDAY_OPTIONS.find((opt) => opt.value === day);
                                if (!item) return null;
                                const active = activeWeekdays.includes(day);
                                return (
                                  <button key={day} type="button" className={`weekday-mini-square ${active ? "active" : ""}`} onClick={() => toggleWeekday(day)}>
                                    {item.label}
                                  </button>
                                );
                              })}
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <div className="col-12 d-flex gap-2 justify-content-end mt-2">
                      <button className="btn btn-sm btn-success" onClick={save} disabled={saving}>Salva</button>
                      <button className="btn btn-sm btn-outline-success" onClick={() => setEditing(false)}>Annulla</button>
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
        open={deleteOpen}
        title="Elimina turno"
        message={`Confermi l'eliminazione del turno "${shiftType.name}"?`}
        confirmLabel="Elimina"
        confirmVariant="danger"
        loading={deleting}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={remove}
      />
    </li>
  );
}
