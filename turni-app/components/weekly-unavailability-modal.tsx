"use client";

import { useEffect, useState } from "react";
import { WeeklyUnavailabilityGrid } from "@/components/weekly-unavailability-grid";
import {
  slotsForWeekday,
  weeklyCellKey,
  type WeeklyShiftType,
  type WeeklySlot,
} from "@/lib/weekly-unavailability";

type Props = {
  open: boolean;
  calendarName: string;
  shiftTypes: WeeklyShiftType[];
  initialCellKeys: ReadonlySet<string>;
  disabled?: boolean;
  onClose: () => void;
  onSave: (cellKeys: Set<string>) => void;
};

export function WeeklyUnavailabilityModal({
  open,
  calendarName,
  shiftTypes: _shiftTypes,
  initialCellKeys,
  disabled,
  onClose,
  onSave,
}: Props) {
  const [draft, setDraft] = useState<Set<string>>(new Set(initialCellKeys));

  useEffect(() => {
    if (open) setDraft(new Set(initialCellKeys));
  }, [open, initialCellKeys]);

  if (!open) return null;

  function toggle(weekday: number, slot: WeeklySlot) {
    setDraft((prev) => {
      const next = new Set(prev);
      const k = weeklyCellKey(weekday, slot);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  function toggleDay(weekday: number) {
    const slots = slotsForWeekday(weekday);
    const allOff = slots.every((s) => draft.has(weeklyCellKey(weekday, s)));
    setDraft((prev) => {
      const next = new Set(prev);
      for (const s of slots) {
        const k = weeklyCellKey(weekday, s);
        if (allOff) next.delete(k);
        else next.add(k);
      }
      return next;
    });
  }

  return (
    <>
      <div className="modal fade show d-block" tabIndex={-1} role="dialog" aria-modal="true">
        <div className="modal-dialog modal-dialog-centered modal-lg">
          <div className="modal-content turny-modal">
            <div className="modal-header">
              <h5 className="modal-title">Indisponibilità settimanali — {calendarName}</h5>
              <button type="button" className="btn-close" onClick={onClose} aria-label="Chiudi" />
            </div>
            <div className="modal-body">
              <WeeklyUnavailabilityGrid
                cellKeys={draft}
                onToggle={toggle}
                onToggleDay={toggleDay}
                disabled={disabled}
              />
            </div>
            <div className="modal-footer turny-modal-footer-split">
              <button type="button" className="btn btn-outline-secondary" onClick={onClose} disabled={disabled}>
                Annulla
              </button>
              <button
                type="button"
                className="btn btn-success"
                onClick={() => onSave(new Set(draft))}
                disabled={disabled}
              >
                Applica
              </button>
            </div>
          </div>
        </div>
      </div>
      <div
        role="presentation"
        onClick={onClose}
        style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.06)", zIndex: 1040 }}
      />
    </>
  );
}
