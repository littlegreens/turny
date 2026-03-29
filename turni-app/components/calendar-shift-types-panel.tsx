"use client";
import { useState } from "react";
import { ShiftTypeCreateForm } from "@/components/shift-type-create-form";
import { ShiftTypeItem } from "@/components/shift-type-item";

type ShiftTypeRow = {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  durationHours: number;
  minStaff: number;
  color: string;
  activeWeekdays: number[];
};

type Props = {
  calendarId: string;
  canEdit: boolean;
  shiftTypes: ShiftTypeRow[];
};

export function CalendarShiftTypesPanel({ calendarId, canEdit, shiftTypes }: Props) {
  const [openCreate, setOpenCreate] = useState(false);

  return (
    <>
      <h2 className="h5 fw-semibold mb-2">Tipi di turno</h2>
      {shiftTypes.length === 0 ? (
        <p className="text-secondary mt-3 mb-0">Nessun turno configurato.</p>
      ) : (
        <ul className="list-unstyled mt-3 d-grid gap-2">
          {shiftTypes.map((shiftType) => (
            <ShiftTypeItem key={shiftType.id} shiftType={shiftType} canEdit={canEdit} />
          ))}
        </ul>
      )}
      {canEdit ? (
        <div className="mt-3 d-flex justify-content-end">
          <button className="btn btn-success" onClick={() => setOpenCreate(true)}>
            Aggiungi turno
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
                  <ShiftTypeCreateForm calId={calendarId} canCreate={canEdit} onCreated={() => setOpenCreate(false)} />
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

