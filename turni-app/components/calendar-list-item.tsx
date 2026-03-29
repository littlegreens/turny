"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
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
  };
  canEdit: boolean;
};

export function CalendarListItem({ orgSlug, calendar, canEdit }: Props) {
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
    <li className="d-flex align-items-center justify-content-between border rounded p-3">
      <div className="d-flex align-items-center gap-3 flex-grow-1">
        <span className="rounded-circle border" style={{ backgroundColor: calendar.color, width: 16, height: 16 }} />
        <div className="w-100">
          <p className="fw-semibold mb-0">{calendar.name}</p>
          <p className="small text-secondary mb-0">
            {calendar.timezone} — giorni attivi definiti su ogni tipo turno (Configura)
          </p>
        </div>
      </div>
      <div className="d-flex align-items-center gap-2">
        <span className="small text-secondary">{calendar.isActive ? "Attivo" : "Disattivo"}</span>
        {canEdit ? (
          <>
            <button className="btn btn-sm btn-outline-success" onClick={() => setEditOpen(true)}>
              Modifica
            </button>
            <Link className="btn btn-sm btn-outline-success" href={`/${orgSlug}/${calendar.id}`}>
              Configura
            </Link>
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
                      <button className="btn btn-success" onClick={() => void save()} disabled={saving}>
                        {saving ? "Salvataggio..." : "Salva"}
                      </button>
                      <button className="btn btn-outline-success" onClick={() => setEditOpen(false)} disabled={saving}>
                        Annulla
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
