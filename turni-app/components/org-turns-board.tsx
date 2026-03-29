"use client";

import Link from "next/link";
import { useState } from "react";
import { OrgTurnCreateForm } from "@/components/org-turn-create-form";
import { OrgTurnListItem } from "@/components/org-turn-list-item";

type TurnRow = {
  id: string;
  calendarId: string;
  calendarName: string;
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
      <div className="d-flex justify-content-between align-items-start gap-3 mt-3 mb-2 flex-wrap">
        <div>
          <h2 className="h2 fw-bold mb-1">Turni</h2>
          <p className="text-secondary mb-0">Monitora e gestisci i turni attivi, organizzati per calendario.</p>
        </div>
        <Link href={`/${orgSlug}/archivio-turni`} className="btn btn-outline-secondary">
          Archivio turni
        </Link>
      </div>

      <section className="card">
        <div className="card-body">
          {turnsByCalendar.length === 0 ? (
            <p className="text-secondary mb-0">Nessun turno attivo.</p>
          ) : (
            <div className="d-grid gap-3">
              {turnsByCalendar.map((group) => (
                <div key={group.calendarId}>
                  <h2 className="h6 fw-semibold mb-2">{group.calendarName}</h2>
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

