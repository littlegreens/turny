"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarCreateForm } from "@/components/calendar-create-form";
import { CalendarListItem } from "@/components/calendar-list-item";
import { useAppToast } from "@/components/app-toast-provider";

type CalendarRow = {
  id: string;
  name: string;
  timezone: string;
  color: string;
  isActive: boolean;
  description: string | null;
  activeWeekdays: number[];
  _count?: { shiftTypes: number; members: number };
};

type Props = {
  orgSlug: string;
  calendars: CalendarRow[];
  canCreateCalendar: boolean;
};

export function OrgCalendarsBoard({ orgSlug, calendars, canCreateCalendar }: Props) {
  const { showToast } = useAppToast();
  const [openCreate, setOpenCreate] = useState(false);
  const [items, setItems] = useState(calendars);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);

  const draggingIndex = useMemo(() => items.findIndex((x) => x.id === draggingId), [items, draggingId]);

  useEffect(() => {
    setItems(calendars);
  }, [calendars]);

  async function persistOrder(nextItems: CalendarRow[]) {
    try {
      setSavingOrder(true);
      const response = await fetch(`/api/orgs/${orgSlug}/calendars/reorder`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ calendarIds: nextItems.map((x) => x.id) }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        showToast("error", payload.error ?? "Ordinamento non salvato");
        setItems(calendars);
        return;
      }
      showToast("success", "Ordine calendari salvato.");
    } catch {
      showToast("error", "Errore di rete durante il salvataggio ordine");
      setItems(calendars);
    } finally {
      setSavingOrder(false);
    }
  }

  function moveItem(list: CalendarRow[], fromIdx: number, toIdx: number) {
    if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return list;
    const next = [...list];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    return next;
  }

  return (
    <>
      <section className="card mt-3">
        <div className="card-body">
          {calendars.length === 0 ? (
            <div className="border rounded p-4 text-center mt-3 mb-0" role="status">
              <p className="fw-semibold mb-1">Nessun calendario creato</p>
              <p className="small text-secondary mb-0">Crea il primo calendario per iniziare a configurare turni e persone.</p>
            </div>
          ) : (
            <ul className="list-unstyled mt-3 d-grid gap-2">
              {items.map((calendar, idx) => (
                <CalendarListItem
                  key={calendar.id}
                  orgSlug={orgSlug}
                  calendar={calendar}
                  canEdit={canCreateCalendar}
                  canReorder={canCreateCalendar}
                  isDragging={draggingId === calendar.id}
                  onDragStart={() => setDraggingId(calendar.id)}
                  onDragOver={(event) => {
                    if (!canCreateCalendar || draggingId === null || draggingIndex === -1) return;
                    event.preventDefault();
                    if (draggingIndex === idx) return;
                    setItems((prev) => {
                      const from = prev.findIndex((x) => x.id === draggingId);
                      return moveItem(prev, from, idx);
                    });
                  }}
                  onDrop={async () => {
                    if (!canCreateCalendar) return;
                    setDraggingId(null);
                    await persistOrder(items);
                  }}
                  onDragEnd={() => setDraggingId(null)}
                />
              ))}
            </ul>
          )}
          <div className="mt-3 d-flex justify-content-end">
            <button className="btn btn-success" onClick={() => setOpenCreate(true)} disabled={!canCreateCalendar || savingOrder}>
              Aggiungi calendario
            </button>
          </div>
        </div>
      </section>

      {openCreate ? (
        <>
          <div className="modal fade show d-block" tabIndex={-1} role="dialog" aria-modal="true">
            <div className="modal-dialog modal-dialog-centered turny-modal-medium">
              <div className="modal-content turny-modal">
                <div className="modal-header">
                  <h5 className="modal-title">Nuovo calendario</h5>
                  <button type="button" className="btn-close" aria-label="Chiudi" onClick={() => setOpenCreate(false)} />
                </div>
                <div className="modal-body pb-4">
                  <CalendarCreateForm orgSlug={orgSlug} canCreate={canCreateCalendar} onCreated={() => setOpenCreate(false)} />
                </div>
              </div>
            </div>
          </div>
          <div
            onClick={() => setOpenCreate(false)}
            style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.06)", zIndex: 1040 }}
          />
        </>
      ) : null}
    </>
  );
}

