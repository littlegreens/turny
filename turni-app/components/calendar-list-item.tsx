"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type DragEvent } from "react";
import { ConfirmModal } from "@/components/confirm-modal";
import { ColorPalettePicker } from "@/components/color-palette-picker";

type Props = {
  orgSlug: string;
  calendar: {
    id: string;
    name: string;
    timezone: string;
    color: string;
    isActive: boolean;
    description: string | null;
    activeWeekdays: number[];
    _count?: { shiftTypes: number; members: number };
  };
  canEdit: boolean;
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

export function CalendarListItem({
  orgSlug,
  calendar,
  canEdit,
  canReorder = false,
  isDragging = false,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: Props) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [name, setName] = useState(calendar.name);
  const [description, setDescription] = useState(calendar.description ?? "");
  const [color, setColor] = useState(calendar.color);
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function save() {
    setSaving(true);
    await fetch(`/api/calendars/${calendar.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description, color }),
    });
    setSaving(false);
    setEditOpen(false);
    router.refresh();
  }

  async function remove() {
    setDeleting(true);
    await fetch(`/api/calendars/${calendar.id}`, { method: "DELETE" });
    setDeleting(false);
    setDeleteOpen(false);
    router.refresh();
  }

  return (
    <li
      className="d-flex align-items-center justify-content-between rounded p-3"
      style={{ border: `1px solid ${calendar.color}`, backgroundColor: colorWithAlpha(calendar.color), opacity: isDragging ? 0.65 : 1 }}
      draggable={canReorder}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      <div className="d-flex align-items-center gap-3 flex-grow-1">
        {canReorder ? (
          <span className="text-secondary" style={{ cursor: "grab", userSelect: "none", fontSize: 18, lineHeight: 1 }} aria-hidden="true" title="Trascina per ordinare">
            ⋮⋮
          </span>
        ) : null}
        <div className="w-100">
          <p className="fw-semibold mb-0">{calendar.name}</p>
          <p className="small text-secondary mb-1">{calendar.description?.trim() || "Nessuna descrizione"}</p>
          <p className="small text-secondary mb-0">
            Persone associate: {calendar._count?.members ?? 0} · Fasce orarie: {calendar._count?.shiftTypes ?? 0}
          </p>
        </div>
      </div>
      <div className="d-flex align-items-center gap-2">
        <Link className="btn btn-sm btn-success" href={`/${orgSlug}/${calendar.id}`}>
          Configura
        </Link>
        {canEdit ? (
          <>
            <button className="btn btn-sm btn-outline-secondary" onClick={() => setEditOpen(true)}>
              Modifica
            </button>
            <button className="btn btn-sm btn-outline-danger" onClick={() => setDeleteOpen(true)}>
              Elimina
            </button>
          </>
        ) : null}
      </div>
      <ConfirmModal
        open={deleteOpen}
        title="Elimina calendario"
        message={`Confermi l'eliminazione di "${calendar.name}"?`}
        confirmLabel="Elimina"
        confirmVariant="danger"
        loading={deleting}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={remove}
      />
      {editOpen ? (
        <>
          <div className="modal fade show d-block" tabIndex={-1} role="dialog" aria-modal="true">
            <div className="modal-dialog modal-dialog-centered turny-modal-medium">
              <div className="modal-content turny-modal">
                <div className="modal-header">
                  <h5 className="modal-title">Modifica calendario</h5>
                  <button type="button" className="btn-close" aria-label="Chiudi" onClick={() => setEditOpen(false)} />
                </div>
                <div className="modal-body pb-4">
                  <div className="row g-3">
                    <div className="col-12">
                      <label className="form-label small mb-1">Nome</label>
                      <input className="form-control input-underlined" value={name} onChange={(e) => setName(e.target.value)} disabled={saving} />
                    </div>
                    <div className="col-12">
                      <label className="form-label small mb-1">Descrizione</label>
                      <textarea className="form-control input-underlined" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} disabled={saving} />
                    </div>
                    <div className="col-12">
                      <label className="form-label small mb-2 d-block">Colore</label>
                      <ColorPalettePicker value={color} onChange={setColor} disabled={saving} />
                    </div>
                    <div className="col-12 d-flex justify-content-end gap-2">
                      <button className="btn btn-outline-secondary" onClick={() => setEditOpen(false)} disabled={saving}>
                        Annulla
                      </button>
                      <button className="btn btn-success" onClick={() => void save()} disabled={saving}>
                        {saving ? "Salvataggio..." : "Salva modifiche"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div onClick={() => setEditOpen(false)} style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.06)", zIndex: 1040 }} />
        </>
      ) : null}
    </li>
  );
}
