"use client";
import { useEffect, useMemo, useState } from "react";
import { ShiftTypeCreateForm } from "@/components/shift-type-create-form";
import { ShiftTypeItem } from "@/components/shift-type-item";
import { useAppToast } from "@/components/app-toast-provider";

type ShiftTypeRow = {
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

type Props = {
  calendarId: string;
  canEdit: boolean;
  shiftTypes: ShiftTypeRow[];
  roleOptions?: string[];
};

export function CalendarShiftTypesPanel({ calendarId, canEdit, shiftTypes, roleOptions = [] }: Props) {
  const { showToast } = useAppToast();
  const [openCreate, setOpenCreate] = useState(false);
  const [items, setItems] = useState(shiftTypes);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);
  const draggingIndex = useMemo(() => items.findIndex((x) => x.id === draggingId), [items, draggingId]);

  useEffect(() => {
    setItems(shiftTypes);
  }, [shiftTypes]);

  function moveItem(list: ShiftTypeRow[], fromIdx: number, toIdx: number) {
    if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return list;
    const next = [...list];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    return next;
  }

  async function persistOrder(nextItems: ShiftTypeRow[]) {
    try {
      setSavingOrder(true);
      const res = await fetch(`/api/calendars/${calendarId}/shift-types/reorder`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shiftTypeIds: nextItems.map((x) => x.id) }),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        showToast("error", payload.error ?? "Ordinamento non salvato");
        setItems(shiftTypes);
        return;
      }
      showToast("success", "Ordine fasce orarie salvato.");
    } catch {
      showToast("error", "Errore di rete durante il salvataggio ordine");
      setItems(shiftTypes);
    } finally {
      setSavingOrder(false);
    }
  }

  return (
    <>
      {shiftTypes.length === 0 ? (
        <div className="alert alert-light border mt-3 mb-0" role="status">
          <div className="fw-semibold mb-1">Nessun turno configurato.</div>
          <div className="small text-secondary">Aggiungi almeno un tipo di turno per attivare la pianificazione del calendario.</div>
        </div>
      ) : (
        <ul className="list-unstyled mt-3 d-grid gap-2">
          {items.map((shiftType, idx) => (
            <ShiftTypeItem
              key={shiftType.id}
              shiftType={shiftType}
              canEdit={canEdit}
              canReorder={canEdit}
              roleOptions={roleOptions}
              isDragging={draggingId === shiftType.id}
              onDragStart={() => setDraggingId(shiftType.id)}
              onDragOver={(event) => {
                if (!canEdit || draggingId === null || draggingIndex === -1) return;
                event.preventDefault();
                if (draggingIndex === idx) return;
                setItems((prev) => {
                  const from = prev.findIndex((x) => x.id === draggingId);
                  return moveItem(prev, from, idx);
                });
              }}
              onDrop={async () => {
                if (!canEdit) return;
                setDraggingId(null);
                await persistOrder(items);
              }}
              onDragEnd={() => setDraggingId(null)}
            />
          ))}
        </ul>
      )}
      {canEdit ? (
        <div className="mt-3 d-flex justify-content-end">
          <button className="btn btn-success" onClick={() => setOpenCreate(true)} disabled={savingOrder}>
            Aggiungi fascia oraria
          </button>
        </div>
      ) : null}
      {openCreate ? (
        <>
          <div className="modal fade show d-block" tabIndex={-1} role="dialog" aria-modal="true">
            <div className="modal-dialog modal-dialog-centered turny-modal-medium">
              <div className="modal-content turny-modal">
                <div className="modal-header">
                  <h5 className="modal-title">Nuovo turno</h5>
                  <button type="button" className="btn-close" aria-label="Chiudi" onClick={() => setOpenCreate(false)} />
                </div>
                <div className="modal-body pb-4">
                  <ShiftTypeCreateForm calId={calendarId} canCreate={canEdit} roleOptions={roleOptions} onCreated={() => setOpenCreate(false)} />
                </div>
              </div>
            </div>
          </div>
          <div onClick={() => setOpenCreate(false)} style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.06)", zIndex: 1040 }} />
        </>
      ) : null}
    </>
  );
}

