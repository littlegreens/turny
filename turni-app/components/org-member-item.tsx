"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { useBeforeUnloadWhen } from "@/hooks/use-unsaved-prompt";
import { ColorPalettePicker } from "@/components/color-palette-picker";
import { ConfirmModal } from "@/components/confirm-modal";
import { ProfessionalRoleInput } from "@/components/professional-role-input";
import { formatWeekdays, WEEKDAY_OPTIONS } from "@/lib/weekdays";

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
  assignedCalendars: {
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
  }[];
};

export function OrgMemberItem({
  member,
  myUserId,
  canEditRole,
  canRemove,
  canAssignAdmin,
  professionalRoleSuggestions,
  assignedCalendars,
}: Props) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [firstName, setFirstName] = useState(member.user.firstName || "");
  const [lastName, setLastName] = useState(member.user.lastName || "");
  const [username, setUsername] = useState(member.user.name || "");
  const [professionalRole, setProfessionalRole] = useState(member.user.professionalRole || "");
  const [email, setEmail] = useState(member.user.email);
  const [password, setPassword] = useState("");
  const [roles, setRoles] = useState<string[]>(member.roles.length ? member.roles : [member.role]);
  const [rowColor, setRowColor] = useState(member.defaultDisplayColor ?? "");
  const [openWeekdayPickerFor, setOpenWeekdayPickerFor] = useState<string | null>(null);
  const [calendarPrefs, setCalendarPrefs] = useState<Record<string, {
    avoidShiftTypeIds: string[];
    targetShiftsWeek: string;
    targetHoursMonth: string;
    targetNightsMonth: string;
    targetSaturdaysMonth: string;
    targetSundaysMonth: string;
    avoidWeekdays: number[];
  }>>(
    Object.fromEntries(
      assignedCalendars.map((cal) => [
        cal.calendarMemberId,
        {
          avoidShiftTypeIds: cal.initialAvoidShiftTypeIds || [],
          targetShiftsWeek: cal.initialTargetShiftsWeek === null ? "" : String(cal.initialTargetShiftsWeek),
          targetHoursMonth: cal.initialTargetHoursMonth === null ? "" : String(cal.initialTargetHoursMonth),
          targetNightsMonth: cal.initialTargetNightsMonth === null ? "" : String(cal.initialTargetNightsMonth),
          targetSaturdaysMonth: cal.initialTargetSaturdaysMonth === null ? "" : String(cal.initialTargetSaturdaysMonth),
          targetSundaysMonth: cal.initialTargetSundaysMonth === null ? "" : String(cal.initialTargetSundaysMonth),
          avoidWeekdays: cal.initialAvoidWeekdays ?? [],
        },
      ]),
    ),
  );
  const [avoidShiftQuery, setAvoidShiftQuery] = useState<Record<string, string>>({});
  const [openAvoidShiftFor, setOpenAvoidShiftFor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [discardEditOpen, setDiscardEditOpen] = useState(false);
  const editSnapshotRef = useRef<string>("");
  const isSelf = member.userId === myUserId;
  const roleLabel: Record<string, string> = {
    ADMIN: "RESPONSABILE",
    MANAGER: "MANAGER",
    WORKER: "WORKER",
  };

  function captureEditState(): string {
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
      rowColor,
      prefs,
    });
  }

  const editFormDirty = useMemo(() => {
    if (!editOpen) return false;
    return captureEditState() !== editSnapshotRef.current;
  }, [
    editOpen,
    firstName,
    lastName,
    username,
    email,
    professionalRole,
    password,
    roles,
    rowColor,
    calendarPrefs,
  ]);

  useBeforeUnloadWhen(editFormDirty && canEditRole);

  function tryCloseEdit(force: boolean) {
    if (!force && editFormDirty) {
      setDiscardEditOpen(true);
      return;
    }
    setEditOpen(false);
    setDiscardEditOpen(false);
    setOpenWeekdayPickerFor(null);
    setSaveError(null);
  }

  function openEdit() {
    const firstN = member.user.firstName || "";
    const lastN = member.user.lastName || "";
    const userN = member.user.name || "";
    const profN = member.user.professionalRole || "";
    const emailN = member.user.email;
    const rolesN = member.roles.length ? [...member.roles] : [member.role];
    const rowN = member.defaultDisplayColor ?? "";
    const prefsN = Object.fromEntries(
      assignedCalendars.map((cal) => [
        cal.calendarMemberId,
        {
          avoidShiftTypeIds: cal.initialAvoidShiftTypeIds || [],
          targetShiftsWeek: cal.initialTargetShiftsWeek === null ? "" : String(cal.initialTargetShiftsWeek),
          targetHoursMonth: cal.initialTargetHoursMonth === null ? "" : String(cal.initialTargetHoursMonth),
          targetNightsMonth: cal.initialTargetNightsMonth === null ? "" : String(cal.initialTargetNightsMonth),
          targetSaturdaysMonth: cal.initialTargetSaturdaysMonth === null ? "" : String(cal.initialTargetSaturdaysMonth),
          targetSundaysMonth: cal.initialTargetSundaysMonth === null ? "" : String(cal.initialTargetSundaysMonth),
          avoidWeekdays: cal.initialAvoidWeekdays ?? [],
        },
      ]),
    );
    const prefKeys = Object.keys(prefsN).sort();
    const prefsSnap = prefKeys.map((k) => [k, prefsN[k]]);
    editSnapshotRef.current = JSON.stringify({
      firstName: firstN,
      lastName: lastN,
      username: userN,
      email: emailN,
      professionalRole: profN,
      password: "",
      roles: [...rolesN].sort(),
      rowColor: rowN,
      prefs: prefsSnap,
    });
    setFirstName(firstN);
    setLastName(lastN);
    setUsername(userN);
    setProfessionalRole(profN);
    setEmail(emailN);
    setPassword("");
    setRoles(rolesN);
    setRowColor(rowN);
    setCalendarPrefs(prefsN);
    setSaveError(null);
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
    setSaveError(null);
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
        defaultDisplayColor: rowColor.trim() === "" ? null : rowColor.trim(),
        useDisplayColorInCalendars: true,
        calendarPreferences: assignedCalendars.map((cal) => ({
          calendarMemberId: cal.calendarMemberId,
          avoidShiftTypeIds: calendarPrefs[cal.calendarMemberId]?.avoidShiftTypeIds || [],
          targetShiftsWeek:
            calendarPrefs[cal.calendarMemberId]?.targetShiftsWeek === ""
              ? null
              : Number(calendarPrefs[cal.calendarMemberId]?.targetShiftsWeek),
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
          avoidWeekdays: calendarPrefs[cal.calendarMemberId]?.avoidWeekdays || [],
        })),
      }),
    });
    setLoading(false);
    if (!res.ok) {
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      setSaveError(payload.error ?? "Salvataggio non riuscito");
      return;
    }
    tryCloseEdit(true);
    setPassword("");
    router.refresh();
  }

  async function remove() {
    if (!canRemove) return;
    setDeleting(true);
    await fetch(`/api/org-members/${member.id}`, { method: "DELETE" });
    setDeleting(false);
    setDeleteOpen(false);
    router.refresh();
  }

  function updateCalendarPref(calendarMemberId: string, patch: Partial<{
    avoidShiftTypeIds: string[];
    targetShiftsWeek: string;
    targetHoursMonth: string;
    targetNightsMonth: string;
    targetSaturdaysMonth: string;
    targetSundaysMonth: string;
    avoidWeekdays: number[];
  }>) {
    setCalendarPrefs((prev) => ({
      ...prev,
      [calendarMemberId]: {
        avoidShiftTypeIds: prev[calendarMemberId]?.avoidShiftTypeIds ?? [],
        targetShiftsWeek: prev[calendarMemberId]?.targetShiftsWeek ?? "",
        targetHoursMonth: prev[calendarMemberId]?.targetHoursMonth ?? "",
        targetNightsMonth: prev[calendarMemberId]?.targetNightsMonth ?? "",
        targetSaturdaysMonth: prev[calendarMemberId]?.targetSaturdaysMonth ?? "",
        targetSundaysMonth: prev[calendarMemberId]?.targetSundaysMonth ?? "",
        avoidWeekdays: prev[calendarMemberId]?.avoidWeekdays ?? [],
        ...patch,
      },
    }));
  }

  function addAvoidShift(calendarMemberId: string, shiftTypeId: string) {
    const current = calendarPrefs[calendarMemberId]?.avoidShiftTypeIds ?? [];
    if (current.includes(shiftTypeId)) return;
    updateCalendarPref(calendarMemberId, { avoidShiftTypeIds: [...current, shiftTypeId] });
    setAvoidShiftQuery((prev) => ({ ...prev, [calendarMemberId]: "" }));
  }

  function removeAvoidShift(calendarMemberId: string, shiftTypeId: string) {
    const current = calendarPrefs[calendarMemberId]?.avoidShiftTypeIds ?? [];
    updateCalendarPref(calendarMemberId, { avoidShiftTypeIds: current.filter((id) => id !== shiftTypeId) });
  }

  function toggleWeekday(calendarMemberId: string, weekday: number) {
    const current = calendarPrefs[calendarMemberId]?.avoidWeekdays ?? [];
    const next = current.includes(weekday) ? current.filter((d) => d !== weekday) : [...current, weekday];
    updateCalendarPref(calendarMemberId, { avoidWeekdays: next });
  }

  return (
    <li className="border rounded p-3">
      <div className="d-flex justify-content-between align-items-center gap-3 flex-wrap">
        <div>
          <p className="fw-semibold mb-0">{`${member.user.firstName} ${member.user.lastName}`.trim() || member.user.email}</p>
          <p className="small text-secondary mb-0">
            @{member.user.name || member.user.email.split("@")[0]} - {member.user.email} - {roles.map((role) => roleLabel[role] ?? role).join(", ")}
          </p>
          {professionalRole ? <p className="small text-secondary mb-0">{professionalRole}</p> : null}
          <p className="small text-secondary mb-0 mt-1">
            Calendari associati: {assignedCalendars.length ? assignedCalendars.map((c) => c.name).join(", ") : "nessuno"}
          </p>
        </div>
        <div className="d-flex align-items-center gap-2">
          <button className="btn btn-sm btn-outline-success" onClick={() => openEdit()}>
            Modifica
          </button>
          {canRemove ? (
            <button className="btn btn-sm btn-outline-danger" onClick={() => setDeleteOpen(true)} disabled={isSelf || loading}>
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
                  <h5 className="modal-title">Modifica membro</h5>
                  <button type="button" className="btn-close" aria-label="Chiudi" onClick={() => tryCloseEdit(false)} />
                </div>
                <div className="modal-body pb-4">
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
            />
          </div>
          <div className="col-12 border-top pt-3 mt-1">
            <ColorPalettePicker
              value={rowColor && /^#[0-9A-Fa-f]{6}$/.test(rowColor) ? rowColor : "#3B8BD4"}
              onChange={setRowColor}
              disabled={!canEditRole || loading}
              label="Colore"
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
          <div className="col-12 mt-3">
            <div className="p-0">
              <p className="fw-semibold mb-2" style={{ fontSize: "1rem", lineHeight: 1.2 }}>
                Preferenze base per calendario
              </p>
              <p className="small text-secondary mb-2">
                Ogni calendario ha il suo blocco: il <strong>tipo di periodo</strong> dei turni (mensile, settimanale o intervallo date) lo definisci quando crei il periodo in quel calendario, non qui.
                Qui salvi solo preferenze di base sulla persona per quel calendario.
              </p>
              {assignedCalendars.length === 0 ? (
                <p className="small text-secondary mb-0">Nessun calendario associato.</p>
              ) : (
                <div className="d-grid gap-2">
                  {assignedCalendars.map((cal) => {
                    const pref = calendarPrefs[cal.calendarMemberId] ?? {
                      avoidShiftTypeIds: [],
                      targetShiftsWeek: "",
                      targetHoursMonth: "",
                      targetNightsMonth: "",
                      targetSaturdaysMonth: "",
                      targetSundaysMonth: "",
                      avoidWeekdays: [],
                    };
                    const rawQuery = avoidShiftQuery[cal.calendarMemberId] ?? "";
                    const query = rawQuery.trim().toLowerCase();
                    const filteredShiftTypes = cal.shiftTypes.filter(
                      (st) => !pref.avoidShiftTypeIds.includes(st.id) && (query.length === 0 || st.name.toLowerCase().includes(query)),
                    );
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
                          <div className="col-md-6">
                            <label className="form-label small mb-1">Evita turno</label>
                            <div className="d-flex flex-wrap align-items-center gap-2 p-2">
                              {pref.avoidShiftTypeIds.map((shiftId) => {
                                const st = cal.shiftTypes.find((x) => x.id === shiftId);
                                if (!st) return null;
                                return (
                                  <span key={shiftId} className="d-inline-flex align-items-center gap-1 px-2 py-1 rounded-2" style={{ border: "1px solid #1f7a3f", background: "#edf7f0", color: "#1f7a3f", fontWeight: 600, fontSize: 12 }}>
                                    {st.name}
                                    <button
                                      type="button"
                                      className="border-0 bg-transparent d-inline-flex align-items-center justify-content-center"
                                      aria-label="Rimuovi turno"
                                      onClick={() => removeAvoidShift(cal.calendarMemberId, shiftId)}
                                      disabled={!canEditRole || loading}
                                      style={{ width: 18, height: 18, color: "#1f7a3f", borderRadius: "50%" }}
                                    >
                                      <span style={{ fontSize: 12, lineHeight: 1 }}>✕</span>
                                    </button>
                                  </span>
                                );
                              })}
                              <div className="position-relative flex-grow-1" style={{ minWidth: 170 }}>
                                <input
                                  className="form-control form-control-sm input-underlined"
                                  placeholder="Scrivi per cercare..."
                                  value={rawQuery}
                                  onFocus={() => setOpenAvoidShiftFor(cal.calendarMemberId)}
                                  onBlur={() => {
                                    window.setTimeout(() => {
                                      setOpenAvoidShiftFor((prev) => (prev === cal.calendarMemberId ? null : prev));
                                    }, 120);
                                  }}
                                  onChange={(e) => {
                                    setAvoidShiftQuery((prev) => ({ ...prev, [cal.calendarMemberId]: e.target.value }));
                                    setOpenAvoidShiftFor(cal.calendarMemberId);
                                  }}
                                  disabled={!canEditRole || loading}
                                />
                                {canEditRole && !loading && openAvoidShiftFor === cal.calendarMemberId && query.length > 0 ? (
                                  <div className="border rounded-2 bg-white shadow-sm p-1 mt-1" style={{ position: "absolute", zIndex: 30, left: 0, right: 0 }}>
                                    {filteredShiftTypes.slice(0, 6).map((st) => (
                                      <div
                                        key={st.id}
                                        className="small px-2 py-1 rounded-2 mb-1"
                                        style={{ color: "#1f7a3f", cursor: "pointer" }}
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={() => {
                                          addAvoidShift(cal.calendarMemberId, st.id);
                                          setOpenAvoidShiftFor(cal.calendarMemberId);
                                        }}
                                      >
                                        {st.name}
                                      </div>
                                    ))}
                                    {filteredShiftTypes.length === 0 ? (
                                      <div className="small text-secondary px-2 py-1">Nessun risultato</div>
                                    ) : null}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          </div>
                          <div className="col-md-3">
                            <label className="form-label small mb-1">Turni</label>
                            <input
                              type="number"
                              min={0}
                              max={21}
                              className="form-control form-control-sm input-underlined"
                              style={{ maxWidth: 110 }}
                              value={pref.targetShiftsWeek}
                              onChange={(e) => updateCalendarPref(cal.calendarMemberId, { targetShiftsWeek: e.target.value })}
                              disabled={!canEditRole || loading}
                            />
                          </div>
                          <div className="col-md-3">
                            <label className="form-label small mb-1">Obiettivo ore (nel mese)</label>
                            <input
                              type="number"
                              min={0}
                              className="form-control form-control-sm input-underlined"
                              style={{ maxWidth: 110 }}
                              value={pref.targetHoursMonth}
                              onChange={(e) => updateCalendarPref(cal.calendarMemberId, { targetHoursMonth: e.target.value })}
                              disabled={!canEditRole || loading}
                            />
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
                            <label className="form-label small mb-1">Numero domeniche</label>
                            <input type="number" min={0} className="form-control form-control-sm input-underlined" style={{ maxWidth: 110 }} value={pref.targetSundaysMonth} onChange={(e) => updateCalendarPref(cal.calendarMemberId, { targetSundaysMonth: e.target.value })} disabled={!canEditRole || loading} />
                          </div>
                          <div className="col-12 position-relative">
                            <label className="form-label small mb-1 d-block">Evita giorni (lun–dom)</label>
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-success"
                              onClick={() => setOpenWeekdayPickerFor((v) => (v === cal.calendarMemberId ? null : cal.calendarMemberId))}
                              disabled={!canEditRole || loading}
                            >
                              {pref.avoidWeekdays.length ? formatWeekdays(pref.avoidWeekdays) : "Seleziona giorni"}
                            </button>
                            {openWeekdayPickerFor === cal.calendarMemberId ? (
                              <div
                                className="weekdays-popover-dark"
                                style={{ position: "absolute", zIndex: 30, minWidth: 260 }}
                              >
                                <div className="d-flex flex-wrap gap-1 mb-2">
                                  {WEEKDAY_OPTIONS.map((day) => (
                                    <button
                                      key={day.value}
                                      type="button"
                                      className={`btn btn-sm ${pref.avoidWeekdays.includes(day.value) ? "btn-success" : "btn-outline-success"}`}
                                      onClick={() => toggleWeekday(cal.calendarMemberId, day.value)}
                                      disabled={!canEditRole || loading}
                                    >
                                      {day.label}
                                    </button>
                                  ))}
                                </div>
                                <button
                                  type="button"
                                  className="btn btn-sm btn-outline-secondary"
                                  onClick={() => setOpenWeekdayPickerFor(null)}
                                >
                                  Chiudi
                                </button>
                              </div>
                            ) : null}
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
            <button className="btn btn-sm btn-success" onClick={save} disabled={!canEditRole || loading}>
              Salva
            </button>
            <button className="btn btn-sm btn-outline-success" onClick={() => tryCloseEdit(false)} disabled={loading}>
              Annulla
            </button>
          </div>
          {saveError ? <p className="small text-danger mb-0">{saveError}</p> : null}
        </div>
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
        message="Uscire dalla modifica membro senza salvare? Le modifiche andranno perse."
        confirmLabel="Abbandona"
        cancelLabel="Continua"
        confirmVariant="danger"
        loading={false}
        onCancel={() => setDiscardEditOpen(false)}
        onConfirm={() => tryCloseEdit(true)}
      />
      <ConfirmModal
        open={deleteOpen}
        title="Rimuovi membro"
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
