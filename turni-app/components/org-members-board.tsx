"use client";

import { useState } from "react";
import { OrgMemberCreateForm } from "@/components/org-member-create-form";
import { OrgMemberItem } from "@/components/org-member-item";

type MemberRow = {
  id: string;
  role: "OWNER" | "ADMIN" | "MANAGER" | "WORKER";
  roles: ("OWNER" | "ADMIN" | "MANAGER" | "WORKER")[];
  userId: string;
  defaultDisplayColor: string | null;
  useDisplayColorInCalendars: boolean;
  user: {
    email: string;
    name: string | null;
    firstName: string;
    lastName: string;
    professionalRole: string;
  };
};

type AssignedCalendar = {
  id: string;
  name: string;
  color: string | null;
  calendarMemberId: string;
  shiftTypes: { id: string; name: string }[];
  initialAvoidShiftTypeIds: string[];
  initialTargetShiftsWeek: number | null;
  initialTargetHoursMonth: number | null;
  initialTargetNightsMonth: number | null;
  initialTargetSaturdaysMonth: number | null;
  initialTargetSundaysMonth: number | null;
  initialAvoidWeekdays: number[];
};

type Props = {
  orgSlug: string;
  myUserId: string;
  /** Ruoli già usati in organizzazione (autocompletamento, dedup maiuscole). */
  professionalRoleSuggestions: string[];
  members: MemberRow[];
  canManage: boolean;
  canEditRole: boolean;
  canAssignAdmin: boolean;
  calendarsByUser: Record<string, AssignedCalendar[]>;
};

export function OrgMembersBoard({
  orgSlug,
  myUserId,
  professionalRoleSuggestions,
  members,
  canManage,
  canEditRole,
  canAssignAdmin,
  calendarsByUser,
}: Props) {
  const [openCreate, setOpenCreate] = useState(false);

  return (
    <>
      <section className="card mt-3">
        <div className="card-body">
          <h2 className="h5 fw-semibold mb-2">Elenco membri</h2>
          <ul className="list-unstyled mt-3 d-grid gap-2">
            {members.map((item) => (
              <OrgMemberItem
                key={item.id}
                member={item}
                myUserId={myUserId}
                canEditRole={canEditRole}
                canRemove={canManage}
                canAssignAdmin={canAssignAdmin}
                assignedCalendars={calendarsByUser[item.userId] ?? []}
                professionalRoleSuggestions={professionalRoleSuggestions}
              />
            ))}
          </ul>
          <div className="mt-3 d-flex justify-content-end">
            <button className="btn btn-success" onClick={() => setOpenCreate(true)} disabled={!canManage}>
              Crea nuovo membro
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
                  <h5 className="modal-title">Nuovo membro</h5>
                  <button type="button" className="btn-close" aria-label="Chiudi" onClick={() => setOpenCreate(false)} />
                </div>
                <div className="modal-body pb-4">
                  <OrgMemberCreateForm
                    orgSlug={orgSlug}
                    canManage={canManage}
                    canAssignAdmin={canAssignAdmin}
                    professionalRoleSuggestions={professionalRoleSuggestions}
                  />
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

