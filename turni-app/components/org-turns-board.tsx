"use client";

import Link from "next/link";
import { useState } from "react";
import { OrgTurnCreateForm } from "@/components/org-turn-create-form";
import { OrgTurnListItem } from "@/components/org-turn-list-item";

type TurnRow = {
  id: string;
  calendarId: string;
  calendarName: string;
  calendarColor: string;
  year: number;
  month: number;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  generationLog: unknown;
};

type Props = {
  orgSlug: string;
  canCreate: boolean;
  calendars: { id: string; name: string }[];
  turnsByCalendar: { calendarId: string; calendarName: string; turns: TurnRow[] }[];
};

export function OrgTurnsBoard({ orgSlug, canCreate, calendars, turnsByCalendar }: Props) {
  const [openCreate, setOpenCreate] = useState(false);

  return (
    <>
      <div className="d-flex justify-content-end mt-3 mb-2">
        <Link href={`/${orgSlug}/archivio-turni`} className="btn btn-outline-secondary">
          Archivio turni
        </Link>
      </div>

      <section className="card">
        <div className="card-body">
          {turnsByCalendar.length === 0 ? (
            <div className="border rounded p-4 text-center" role="status">
              <p className="fw-semibold mb-1">Nessun piano turni attivo</p>
              <p className="small text-secondary mb-0">Crea il primo piano turni selezionando un calendario e un periodo.</p>
            </div>
          ) : (
            <div className="d-grid gap-3">
              {turnsByCalendar.map((group) => (
                <div key={group.calendarId}>
                  <h3 className="mb-2">{group.calendarName}</h3>
                  <ul className="list-unstyled d-grid gap-2 mb-0">
                    {group.turns.map((turn) => (
                      <OrgTurnListItem key={turn.id} orgSlug={orgSlug} schedule={turn} canEdit={canCreate} />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
          <div className="mt-3 d-flex justify-content-end">
            <button className="btn btn-success" onClick={() => setOpenCreate(true)} disabled={!canCreate}>
              Aggiungi turno
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
                  <h5 className="modal-title">Nuovo turno</h5>
                  <button type="button" className="btn-close" aria-label="Chiudi" onClick={() => setOpenCreate(false)} />
                </div>
                <div className="modal-body pb-4 mb-1">
                  <OrgTurnCreateForm orgSlug={orgSlug} calendars={calendars} canCreate={canCreate} onCreated={() => setOpenCreate(false)} />
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

