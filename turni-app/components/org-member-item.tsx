"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useBeforeUnloadWhen } from "@/hooks/use-unsaved-prompt";
import { ColorPalettePicker } from "@/components/color-palette-picker";
import { ConfirmModal } from "@/components/confirm-modal";
import { ProfessionalRoleInput } from "@/components/professional-role-input";
import { useAppToast } from "@/components/app-toast-provider";
import { WeeklyUnavailabilityModal } from "@/components/weekly-unavailability-modal";
import { formatWeeklyUnavailabilitySummary, weeklyCellsFromKeys } from "@/lib/weekly-unavailability";

type Props = {
  member: {
    id: string;
    role: "OWNER" | "ADMIN" | "MANAGER" | "WORKER";
    roles: ("OWNER" | "ADMIN" | "MANAGER" | "WORKER")[];
    userId: string;
    defaultDisplayColor: string | null;
    useDisplayColorInCalendars: boolean;
    user: { email: string; name: string | null; firstName: string; lastName: string; professionalRole: string };
  };
  myUserId: string;
  canEditRole: boolean;
  canRemove: boolean;
  canAssignAdmin: boolean;
  professionalRoleSuggestions: string[];
  allCalendars: { id: string; name: string; color: string | null }[];
  assignedCalendars: {
    id: string;
    name: string;
    color: string | null;
    calendarMemberId: string;
    shiftTypes: { id: string; name: string; startTime: string; activeWeekdays: number[] }[];
    initialWeeklyCellKeys: string[];
    initialTargetShiftsMonth: number | null;
    initialTargetHoursMonth: number | null;
    initialTargetNightsMonth: number | null;
    initialTargetSaturdaysMonth: number | null;
    initialTargetSundaysMonth: number | null;
    initialNoHolidayWork: boolean;
  }[];
  pageMode?: boolean;
};

export function OrgMemberItem({
  member,
  myUserId,
  canEditRole,
  canRemove,
  canAssignAdmin,
  professionalRoleSuggestions,
  allCalendars,
  assignedCalendars,
  pageMode = false,
}: Props) {
  const router = useRouter();
  const { showToast } = useAppToast();
  const [editOpen, setEditOpen] = useState(false);
  const [firstName, setFirstName] = useState(member.user.firstName || "");
  const [lastName, setLastName] = useState(member.user.lastName || "");
  const [username, setUsername] = useState(member.user.name || "");
  const [professionalRole, setProfessionalRole] = useState(member.user.professionalRole || "");
  const [email, setEmail] = useState(member.user.email);
  const [password, setPassword] = useState("");
  const [roles, setRoles] = useState<string[]>(member.roles.length ? member.roles : [member.role]);
  const [managedCalendarIds, setManagedCalendarIds] = useState<string[]>(assignedCalendars.map((c) => c.id));
  const [rowColor, setRowColor] = useState(member.defaultDisplayColor ?? "");
  const [weeklyModalFor, setWeeklyModalFor] = useState<string | null>(null);
  const [calendarPrefs, setCalendarPrefs] = useState<Record<string, {
    weeklyCellKeys: string[];
    targetShiftsMonth: string;
    targetHoursMonth: string;
    targetNightsMonth: string;
    targetSaturdaysMonth: string;
    targetSundaysMonth: string;
    noHolidayWork: boolean;
  }>>(
    Object.fromEntries(
      assignedCalendars.map((cal) => [
        cal.calendarMemberId,
        {
          weeklyCellKeys: cal.initialWeeklyCellKeys ?? [],
          targetShiftsMonth: cal.initialTargetShiftsMonth === null ? "" : String(cal.initialTargetShiftsMonth),
          targetHoursMonth: cal.initialTargetHoursMonth === null ? "" : String(cal.initialTargetHoursMonth),
          targetNightsMonth: cal.initialTargetNightsMonth === null ? "" : String(cal.initialTargetNightsMonth),
          targetSaturdaysMonth: cal.initialTargetSaturdaysMonth === null ? "" : String(cal.initialTargetSaturdaysMonth),
          targetSundaysMonth: cal.initialTargetSundaysMonth === null ? "" : String(cal.initialTargetSundaysMonth),
          noHolidayWork: cal.initialNoHolidayWork ?? false,
        },
      ]),
    ),
  );
  const [loading, setLoading] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [discardEditOpen, setDiscardEditOpen] = useState(false);
  const [editSnapshot, setEditSnapshot] = useState<string>("");
  const pathname = usePathname();
  const isSelf = member.userId === myUserId;

  useEffect(() => {
    if (pageMode && !editOpen) {
      openEdit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageMode]);

  const roleLabel: Record<string, string> = {
    ADMIN: "RESPONSABILE",
    MANAGER: "MANAGER",
    WORKER: "WORKER",
  };

  const captureEditState = useCallback((): string => {
    const prefKeys = Object.keys(calendarPrefs).sort();
    const prefs = prefKeys.map((k) => [k, calendarPrefs[k]]);
    return JSON.stringify({
      firstName,
      lastName,
      username,
      email,
      professionalRole,
      password,
      roles: [...roles].sort(),
      managedCalendarIds: [...managedCalendarIds].sort(),
      rowColor,
      prefs,
    });
  }, [calendarPrefs, email, firstName, lastName, managedCalendarIds, password, professionalRole, roles, rowColor, username]);

  const editFormDirty = useMemo(() => {
    if (!editOpen) return false;
    return captureEditState() !== editSnapshot;
  }, [captureEditState, editOpen, editSnapshot]);

  useBeforeUnloadWhen(editFormDirty && canEditRole);

  function tryCloseEdit(force: boolean) {
    if (!force && editFormDirty) {
      setDiscardEditOpen(true);
      return;
    }
    setDiscardEditOpen(false);
    setWeeklyModalFor(null);
    if (pageMode) {
      const orgSlug = pathname.split("/")[1] ?? "";
      router.push(`/${orgSlug}/members`);
      return;
    }
    setEditOpen(false);
  }

  function openEdit() {
    const firstN = member.user.firstName || "";
    const lastN = member.user.lastName || "";
    const userN = member.user.name || "";
    const profN = member.user.professionalRole || "";
    const emailN = member.user.email;
    const rolesN = member.roles.length ? [...member.roles] : [member.role];
    const managedCalN = assignedCalendars.map((c) => c.id);
    const rowN = member.defaultDisplayColor ?? "";
    const prefsN = Object.fromEntries(
      assignedCalendars.map((cal) => [
        cal.calendarMemberId,
        {
          weeklyCellKeys: cal.initialWeeklyCellKeys ?? [],
          targetShiftsMonth: cal.initialTargetShiftsMonth === null ? "" : String(cal.initialTargetShiftsMonth),
          targetHoursMonth: cal.initialTargetHoursMonth === null ? "" : String(cal.initialTargetHoursMonth),
          targetNightsMonth: cal.initialTargetNightsMonth === null ? "" : String(cal.initialTargetNightsMonth),
          targetSaturdaysMonth: cal.initialTargetSaturdaysMonth === null ? "" : String(cal.initialTargetSaturdaysMonth),
          targetSundaysMonth: cal.initialTargetSundaysMonth === null ? "" : String(cal.initialTargetSundaysMonth),
          noHolidayWork: cal.initialNoHolidayWork ?? false,
        },
      ]),
    );
    const prefKeys = Object.keys(prefsN).sort();
    const prefsSnap = prefKeys.map((k) => [k, prefsN[k]]);
    setEditSnapshot(
      JSON.stringify({
      firstName: firstN,
      lastName: lastN,
      username: userN,
      email: emailN,
      professionalRole: profN,
      password: "",
      roles: [...rolesN].sort(),
      managedCalendarIds: [...managedCalN].sort(),
      rowColor: rowN,
      prefs: prefsSnap,
      }),
    );
    setFirstName(firstN);
    setLastName(lastN);
    setUsername(userN);
    setProfessionalRole(profN);
    setEmail(emailN);
    setPassword("");
    setRoles(rolesN);
    setManagedCalendarIds(managedCalN);
    setRowColor(rowN);
    setCalendarPrefs(prefsN);
    setEditOpen(true);
  }

  function toggleRole(role: string) {
    if (roles.includes(role)) {
      if (roles.length === 1) return;
      setRoles(roles.filter((r) => r !== role));
      return;
    }
    setRoles([...roles, role]);
  }

  async function save() {
    if (!canEditRole) return;
    setLoading(true);
    const res = await fetch(`/api/org-members/${member.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName,
        lastName,
        username,
        professionalRole,
        email,
        password,
        roles,
        managedCalendarIds,
        defaultDisplayColor: rowColor.trim() === "" ? null : rowColor.trim(),
        useDisplayColorInCalendars: true,
        calendarPreferences: assignedCalendars.map((cal) => ({
          calendarMemberId: cal.calendarMemberId,
          weeklyUnavailability: weeklyCellsFromKeys(calendarPrefs[cal.calendarMemberId]?.weeklyCellKeys ?? []),
          targetShiftsMonth:
            calendarPrefs[cal.calendarMemberId]?.targetShiftsMonth === ""
              ? null
              : Number(calendarPrefs[cal.calendarMemberId]?.targetShiftsMonth),
          targetHoursMonth:
            calendarPrefs[cal.calendarMemberId]?.targetHoursMonth === ""
              ? null
              : Number(calendarPrefs[cal.calendarMemberId]?.targetHoursMonth),
          targetNightsMonth:
            calendarPrefs[cal.calendarMemberId]?.targetNightsMonth === ""
              ? null
              : Number(calendarPrefs[cal.calendarMemberId]?.targetNightsMonth),
          targetSaturdaysMonth:
            calendarPrefs[cal.calendarMemberId]?.targetSaturdaysMonth === ""
              ? null
              : Number(calendarPrefs[cal.calendarMemberId]?.targetSaturdaysMonth),
          targetSundaysMonth:
            calendarPrefs[cal.calendarMemberId]?.targetSundaysMonth === ""
              ? null
              : Number(calendarPrefs[cal.calendarMemberId]?.targetSundaysMonth),
          noHolidayWork: Boolean(calendarPrefs[cal.calendarMemberId]?.noHolidayWork),
        })),
      }),
    });
    setLoading(false);
    if (!res.ok) {
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      showToast("error", payload.error ?? "Salvataggio non riuscito");
      return;
    }
    if (!pageMode) tryCloseEdit(true);
    setPassword("");
    showToast("success", "Persona aggiornata.");
    router.refresh();
  }

  function toggleManagedCalendar(calendarId: string) {
    setManagedCalendarIds((prev) =>
      prev.includes(calendarId) ? prev.filter((id) => id !== calendarId) : [...prev, calendarId],
    );
  }

  async function remove() {
    if (!canRemove) return;
    setDeleting(true);
    await fetch(`/api/org-members/${member.id}`, { method: "DELETE" });
    setDeleting(false);
    setDeleteOpen(false);
    if (pageMode) {
      const orgSlug = pathname.split("/")[1] ?? "";
      router.push(`/${orgSlug}/members`);
      return;
    }
    router.refresh();
  }

  function updateCalendarPref(calendarMemberId: string, patch: Partial<{
    weeklyCellKeys: string[];
    targetShiftsMonth: string;
    targetHoursMonth: string;
    targetNightsMonth: string;
    targetSaturdaysMonth: string;
    targetSundaysMonth: string;
    noHolidayWork: boolean;
  }>) {
    setCalendarPrefs((prev) => ({
      ...prev,
      [calendarMemberId]: {
        weeklyCellKeys: prev[calendarMemberId]?.weeklyCellKeys ?? [],
        targetShiftsMonth: prev[calendarMemberId]?.targetShiftsMonth ?? "",
        targetHoursMonth: prev[calendarMemberId]?.targetHoursMonth ?? "",
        targetNightsMonth: prev[calendarMemberId]?.targetNightsMonth ?? "",
        targetSaturdaysMonth: prev[calendarMemberId]?.targetSaturdaysMonth ?? "",
        targetSundaysMonth: prev[calendarMemberId]?.targetSundaysMonth ?? "",
        noHolidayWork: prev[calendarMemberId]?.noHolidayWork ?? false,
        ...patch,
      },
    }));
  }

  const orgSlugFromPath = pathname.split("/")[1] ?? "";

  function renderEditForm() {
    const weeklyModalCal = assignedCalendars.find((c) => c.calendarMemberId === weeklyModalFor);
    return (
      <>
        <div className="row g-3">
          <div className="col-md-4">
            <label className="form-label small mb-1">Nome</label>
            <input className="form-control form-control-sm input-underlined" value={firstName} onChange={(e) => setFirstName(e.target.value)} disabled={!canEditRole || loading} />
          </div>
          <div className="col-md-4">
            <label className="form-label small mb-1">Cognome (opzionale)</label>
            <input className="form-control form-control-sm input-underlined" value={lastName} onChange={(e) => setLastName(e.target.value)} disabled={!canEditRole || loading} />
          </div>
          <div className="col-md-4">
            <label className="form-label small mb-1">Email</label>
            <input className="form-control form-control-sm input-underlined" value={email} onChange={(e) => setEmail(e.target.value)} disabled={!canEditRole || loading} />
          </div>
          <div className="col-md-4">
            <label className="form-label small mb-1">Username</label>
            <input className="form-control form-control-sm input-underlined" value={username} onChange={(e) => setUsername(e.target.value)} disabled={!canEditRole || loading} />
          </div>
          <div className="col-md-12">
            <label className="form-label small mb-1">Ruolo professionale</label>
            <ProfessionalRoleInput
              name={`professional-role-${member.id}`}
              value={professionalRole}
              onChange={setProfessionalRole}
              suggestions={professionalRoleSuggestions}
              disabled={!canEditRole || loading}
              orgSlug={orgSlugFromPath}
              canManageGlobalRoles={canEditRole}
            />
          </div>
          <div className="col-md-12">
            <label className="form-label small mb-1">Nuova password</label>
            <input type="password" minLength={8} className="form-control form-control-sm input-underlined" value={password} onChange={(e) => setPassword(e.target.value)} disabled={!canEditRole || loading} />
          </div>
          <div className="col-12">
            <label className="form-label small mb-1 d-block">Ruoli multipli</label>
            <div className="d-flex flex-wrap gap-2">
              {(canAssignAdmin ? ["ADMIN", "MANAGER", "WORKER"] : ["MANAGER", "WORKER"]).map((roleOpt) => (
                <button
                  key={roleOpt}
                  type="button"
                  className={`btn btn-sm ${roles.includes(roleOpt) ? "btn-success" : "btn-outline-success"}`}
                  onClick={() => toggleRole(roleOpt)}
                  disabled={!canEditRole || loading}
                >
                  {roleLabel[roleOpt] ?? roleOpt}
                </button>
              ))}
            </div>
          </div>
          {roles.includes("MANAGER") ? (
            <div className="col-12">
              <label className="form-label small mb-1 d-block">Assegna calendari al manager</label>
              <p className="small text-secondary mb-2">
                Questi calendari definiscono dove il manager può accedere e creare turni.
              </p>
              <div className="d-flex flex-wrap gap-2">
                {allCalendars.map((cal) => {
                  const active = managedCalendarIds.includes(cal.id);
                  return (
                    <button
                      key={cal.id}
                      type="button"
                      className={`btn btn-sm ${active ? "btn-success" : "btn-outline-success"}`}
                      onClick={() => toggleManagedCalendar(cal.id)}
                      disabled={!canEditRole || loading}
                      title={cal.name}
                    >
                      {cal.name}
                    </button>
                  );
                })}
              </div>
              {!allCalendars.length ? <p className="small text-secondary mt-2 mb-0">Nessun calendario disponibile.</p> : null}
            </div>
          ) : null}
          <div className="col-12 mt-3">
            <div className="p-0">
              <p className="fw-semibold mb-2" style={{ fontSize: "1rem", lineHeight: 1.2 }}>
                Preferenze base per calendario
              </p>
              <p className="small text-secondary mb-2">
                Qui imposti solo le preferenze base della persona per questo calendario.
              </p>
              <div className="mb-3">
                <ColorPalettePicker
                  value={rowColor && /^#[0-9A-Fa-f]{6}$/.test(rowColor) ? rowColor : "#3B8BD4"}
                  onChange={setRowColor}
                  disabled={!canEditRole || loading}
                  label="Colore in griglia turni"
                />
              </div>
              {assignedCalendars.length === 0 ? (
                <p className="small text-secondary mb-0">Nessun calendario associato.</p>
              ) : (
                <div className="d-grid gap-2">
                  {assignedCalendars.map((cal) => {
                    const pref = calendarPrefs[cal.calendarMemberId] ?? {
                      weeklyCellKeys: [],
                      targetShiftsMonth: "",
                      targetHoursMonth: "",
                      targetNightsMonth: "",
                      targetSaturdaysMonth: "",
                      targetSundaysMonth: "",
                      noHolidayWork: false,
                    };
                    const weeklySummary = formatWeeklyUnavailabilitySummary(pref.weeklyCellKeys);
                    return (
                      <div
                        key={cal.calendarMemberId}
                        className="position-relative rounded-3"
                        style={{ border: `1px solid ${cal.color ?? "#d0d7de"}`, padding: "0.9rem" }}
                      >
                        <p className="fw-semibold mb-2" style={{ fontSize: "1rem", lineHeight: 1.2 }}>
                          {cal.name}
                        </p>
                        <div className="row g-3">
                          <div className="col-12">
                            <label className="form-label small mb-1">Indisponibilità settimanali</label>
                            <p className="small text-secondary mb-2">{weeklySummary}</p>
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-success"
                              onClick={() => setWeeklyModalFor(cal.calendarMemberId)}
                              disabled={!canEditRole || loading}
                            >
                              Configura griglia settimanale
                            </button>
                            <div className="member-popup-field-row mt-3">
                              <span className="member-popup-field-label">Evita festivi</span>
                              <button
                                type="button"
                                role="switch"
                                aria-checked={pref.noHolidayWork}
                                aria-label="Evita festivi"
                                className={`turny-toggle-switch member-popup-field-control ${pref.noHolidayWork ? "is-on" : ""}`}
                                onClick={() =>
                                  updateCalendarPref(cal.calendarMemberId, { noHolidayWork: !pref.noHolidayWork })
                                }
                                disabled={!canEditRole || loading}
                              >
                                <span className="turny-toggle-switch-track" aria-hidden="true">
                                  <span className="turny-toggle-switch-knob" />
                                </span>
                              </button>
                            </div>
                          </div>
                          <div className="col-md-3">
                            <label className="form-label small mb-1">Max turni</label>
                            <input type="number" min={0} max={200} className="form-control form-control-sm input-underlined" style={{ maxWidth: 110 }} value={pref.targetShiftsMonth} onChange={(e) => updateCalendarPref(cal.calendarMemberId, { targetShiftsMonth: e.target.value })} disabled={!canEditRole || loading} />
                          </div>
                          <div className="col-md-3">
                            <label className="form-label small mb-1">Obiettivo ore</label>
                            <input type="number" min={0} className="form-control form-control-sm input-underlined" style={{ maxWidth: 110 }} value={pref.targetHoursMonth} onChange={(e) => updateCalendarPref(cal.calendarMemberId, { targetHoursMonth: e.target.value })} disabled={!canEditRole || loading} />
                          </div>
                          <div className="col-md-2">
                            <label className="form-label small mb-1">Numero notti</label>
                            <input type="number" min={0} className="form-control form-control-sm input-underlined" style={{ maxWidth: 110 }} value={pref.targetNightsMonth} onChange={(e) => updateCalendarPref(cal.calendarMemberId, { targetNightsMonth: e.target.value })} disabled={!canEditRole || loading} />
                          </div>
                          <div className="col-md-2">
                            <label className="form-label small mb-1">Numero sabati</label>
                            <input type="number" min={0} className="form-control form-control-sm input-underlined" style={{ maxWidth: 110 }} value={pref.targetSaturdaysMonth} onChange={(e) => updateCalendarPref(cal.calendarMemberId, { targetSaturdaysMonth: e.target.value })} disabled={!canEditRole || loading} />
                          </div>
                          <div className="col-md-2">
                            <label className="form-label small mb-1">Numero festivi</label>
                            <input type="number" min={0} className="form-control form-control-sm input-underlined" style={{ maxWidth: 110 }} value={pref.targetSundaysMonth} onChange={(e) => updateCalendarPref(cal.calendarMemberId, { targetSundaysMonth: e.target.value })} disabled={!canEditRole || loading} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          <div className="col-12 d-flex justify-content-end gap-2">
            {!pageMode ? (
              <button className="btn btn-sm btn-outline-secondary" onClick={() => tryCloseEdit(false)} disabled={loading}>Annulla</button>
            ) : null}
            {canRemove && pageMode ? (
              <button className="btn btn-sm btn-danger turny-btn-action" onClick={() => setDeleteOpen(true)} disabled={isSelf || loading}>Rimuovi persona</button>
            ) : null}
            <button className="btn btn-sm btn-success" onClick={save} disabled={!canEditRole || loading}>
              {loading ? "Salvataggio..." : "Salva modifiche"}
            </button>
          </div>
        </div>
        {weeklyModalCal ? (
          <WeeklyUnavailabilityModal
            open
            calendarName={weeklyModalCal.name}
            shiftTypes={weeklyModalCal.shiftTypes}
            initialCellKeys={new Set(calendarPrefs[weeklyModalCal.calendarMemberId]?.weeklyCellKeys ?? [])}
            disabled={!canEditRole || loading}
            onClose={() => setWeeklyModalFor(null)}
            onSave={(keys) => {
              updateCalendarPref(weeklyModalCal.calendarMemberId, { weeklyCellKeys: [...keys] });
              setWeeklyModalFor(null);
            }}
          />
        ) : null}
      </>
    );
  }

  if (pageMode) {
    return (
      <>
        {editOpen ? (
          <div className="card">
            <div className="card-body">
              {renderEditForm()}
            </div>
          </div>
        ) : null}
        <ConfirmModal
          open={discardEditOpen}
          nested
          title="Modifiche non salvate"
          message="Uscire dalla modifica persona senza salvare? Le modifiche andranno perse."
          confirmLabel="Abbandona"
          cancelLabel="Continua"
          confirmVariant="danger"
          loading={false}
          onCancel={() => setDiscardEditOpen(false)}
          onConfirm={() => tryCloseEdit(true)}
        />
        <ConfirmModal
          open={deleteOpen}
          title="Rimuovi persona"
          message={`Confermi la rimozione di ${member.user.email}?`}
          confirmLabel="Rimuovi"
          confirmVariant="danger"
          loading={deleting}
          onCancel={() => setDeleteOpen(false)}
          onConfirm={remove}
        />
      </>
    );
  }

  const memberCardColor = /^#[0-9A-Fa-f]{6}$/.test(member.defaultDisplayColor ?? "") ? (member.defaultDisplayColor as string) : "#1f7a3f";
  return (
    <li className="rounded p-3" style={{ border: `1px solid ${memberCardColor}`, backgroundColor: `${memberCardColor}1f` }}>
      <div className="d-flex justify-content-between align-items-center gap-3 flex-wrap">
        <div>
          <p className="fw-semibold mb-0">{`${member.user.firstName} ${member.user.lastName}`.trim() || member.user.email}</p>
          <p className="small text-secondary mb-0">
            @{member.user.name || member.user.email.split("@")[0]} · {member.user.email} · {roles.map((role) => roleLabel[role] ?? role).join(", ")}
          </p>
          {professionalRole ? <p className="small text-secondary mb-0">{professionalRole}</p> : null}
          <p className="small text-secondary mb-0 mt-1">
            Calendari associati: {assignedCalendars.length ? assignedCalendars.map((c) => c.name).join(", ") : "nessuno"}
          </p>
        </div>
        <div className="d-flex align-items-center gap-2">
          <Link className="btn btn-sm btn-success" href={`/${orgSlugFromPath}/members/${member.id}`}>
            Dettaglio
          </Link>
          {canRemove ? (
            <button className="btn btn-sm btn-danger turny-btn-action" onClick={() => setDeleteOpen(true)} disabled={isSelf || loading}>
              Rimuovi
            </button>
          ) : null}
        </div>
      </div>

      {editOpen ? (
        <>
          <div className="modal fade show d-block" tabIndex={-1} role="dialog" aria-modal="true">
            <div className="modal-dialog modal-dialog-centered turny-modal-wide">
              <div className="modal-content turny-modal">
                <div className="modal-header">
                  <h5 className="modal-title">Modifica persona</h5>
                  <button type="button" className="btn-close" aria-label="Chiudi" onClick={() => tryCloseEdit(false)} />
                </div>
                <div className="modal-body pb-4">
                  {renderEditForm()}
                </div>
              </div>
            </div>
          </div>
          <div
            role="presentation"
            onClick={() => {
              if (loading) return;
              tryCloseEdit(false);
            }}
            style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.06)", zIndex: 1040 }}
          />
        </>
      ) : null}
      <ConfirmModal
        open={discardEditOpen}
        nested
        title="Modifiche non salvate"
        message="Uscire dalla modifica persona senza salvare? Le modifiche andranno perse."
        confirmLabel="Abbandona"
        cancelLabel="Continua"
        confirmVariant="danger"
        loading={false}
        onCancel={() => setDiscardEditOpen(false)}
        onConfirm={() => tryCloseEdit(true)}
      />
      <ConfirmModal
        open={deleteOpen}
        title="Rimuovi persona"
        message={`Confermi la rimozione di ${member.user.email}?`}
        confirmLabel="Rimuovi"
        confirmVariant="danger"
        loading={deleting}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={remove}
      />
    </li>
  );
}
