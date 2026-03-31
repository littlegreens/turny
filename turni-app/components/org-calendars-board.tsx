"use client";

import { useState } from "react";
import { CalendarCreateForm } from "@/components/calendar-create-form";
import { CalendarListItem } from "@/components/calendar-list-item";

type CalendarRow = {
  id: string;
  name: string;
  timezone: string;
  color: string;
  isActive: boolean;
  description: string | null;
  activeWeekdays: number[];
  _count?: { shiftTypes: number };
};

type Props = {
  orgSlug: string;
  calendars: CalendarRow[];
  canCreateCalendar: boolean;
};

export function OrgCalendarsBoard({ orgSlug, calendars, canCreateCalendar }: Props) {
  const [openCreate, setOpenCreate] = useState(false);

  return (
    <>
      <section className="card mt-4">
        <div className="card-body">
          <h2 className="h5 fw-semibold">Calendari</h2>
          {calendars.length === 0 ? (
            <div className="alert alert-light border mt-3 mb-0" role="status">
              <div className="fw-semibold mb-1">Nessun calendario creato.</div>
              <div className="small text-secondary">Crea il primo calendario per iniziare a configurare turni e membri.</div>
            </div>
          ) : (
            <ul className="list-unstyled mt-3 d-grid gap-2">
              {calendars.map((calendar) => (
                <CalendarListItem key={calendar.id} orgSlug={orgSlug} calendar={calendar} canEdit={canCreateCalendar} />
              ))}
            </ul>
          )}
          <div className="mt-3 d-flex justify-content-end">
            <button className="btn btn-success" onClick={() => setOpenCreate(true)} disabled={!canCreateCalendar}>
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

