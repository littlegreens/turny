"use client";

import Image from "next/image";
import { useCallback, useMemo, useState } from "react";
import {
  SCHEDULE_PREVIEW_ZOOM_LEVELS,
  buildSchedulePreviewCalendarWeekRows,
  ScheduleReadonlyCalendarWeeks,
  ScheduleReadonlyStandardTable,
  utcDayOfWeek,
  type SchedulePreviewMemberColor,
  type SchedulePreviewShiftType,
} from "@/components/schedule-readonly-preview";
import { isShiftActiveOnDate, type HolidayOverrideDraft } from "@/lib/holiday-overrides";

type ShiftTypeCol = {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  color: string;
  minStaff: number;
  activeWeekdays: number[];
};

type MemberOpt = {
  id: string;
  userId?: string;
  label: string;
  memberColor: string | null;
};

type GridAssignment = {
  id: string;
  memberId: string;
  isGuest?: boolean;
  guestColor?: string | null;
  shiftTypeId: string;
  date: string;
  memberLabel: string;
  shiftTypeName: string;
  shiftTypeColor: string;
};

type Props = {
  year: number;
  month: number;
  startDate?: string;
  endDate?: string;
  currentUserId?: string;
  holidayOverrides?: HolidayOverrideDraft[];
  shiftTypes: ShiftTypeCol[];
  members: MemberOpt[];
  assignments: GridAssignment[];
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function formatDateIt(isoDate: string) {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  return new Intl.DateTimeFormat("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

function formatDateShort(isoDate: string) {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  return new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short" }).format(d);
}

export function WorkerTurnsView({
  year,
  month,
  startDate,
  endDate,
  currentUserId,
  holidayOverrides = [],
  shiftTypes,
  members,
  assignments,
}: Props) {
  const [viewMode, setViewMode] = useState<"standard" | "calendar" | "mine">("standard");
  const [soloMeOnly, setSoloMeOnly] = useState(false);
  const [previewZoomIdx, setPreviewZoomIdx] = useState(3);

  const holidayList = useMemo(() => holidayOverrides ?? [], [holidayOverrides]);

  const isShiftActivePreview = useCallback(
    (dateStr: string, st: SchedulePreviewShiftType) =>
      isShiftActiveOnDate(holidayList, dateStr, utcDayOfWeek(dateStr), st.id, st.activeWeekdays),
    [holidayList],
  );

  const dates = useMemo(() => {
    if (startDate && endDate && endDate >= startDate) {
      const out: string[] = [];
      const d = new Date(`${startDate}T00:00:00.000Z`);
      const end = new Date(`${endDate}T00:00:00.000Z`);
      while (d <= end) {
        out.push(d.toISOString().slice(0, 10));
        d.setUTCDate(d.getUTCDate() + 1);
      }
      return out;
    }
    const dim = daysInMonth(year, month);
    return Array.from({ length: dim }, (_, i) => `${year}-${pad(month)}-${pad(i + 1)}`);
  }, [endDate, month, startDate, year]);

  const days = dates.map((dateStr) => {
    const dt = new Date(`${dateStr}T00:00:00.000Z`);
    return {
      dateStr,
      day: dt.getUTCDate(),
      weekday: new Intl.DateTimeFormat("it-IT", { weekday: "short" }).format(dt),
    };
  });

  const calendarWeekRows = useMemo(() => buildSchedulePreviewCalendarWeekRows(dates), [dates]);

  const previewMemberColorById = useMemo(() => {
    const m = new Map<string, SchedulePreviewMemberColor>();
    for (const x of members) m.set(x.id, { memberColor: x.memberColor });
    return m;
  }, [members]);

  const myMember = useMemo(
    () => (currentUserId ? members.find((m) => m.userId === currentUserId) ?? null : null),
    [currentUserId, members],
  );

  const displayAssignments = useMemo(() => {
    if (!soloMeOnly || !myMember) return assignments;
    return assignments.filter((a) => a.memberId === myMember.id);
  }, [assignments, soloMeOnly, myMember]);

  const byCell = useMemo(() => {
    const m = new Map<string, GridAssignment[]>();
    for (const a of displayAssignments) {
      const k = `${a.date}|${a.shiftTypeId}`;
      const list = m.get(k) ?? [];
      list.push(a);
      m.set(k, list);
    }
    return m;
  }, [displayAssignments]);

  const myAssignments = useMemo(() => {
    if (!myMember) return [] as GridAssignment[];
    return assignments
      .filter((a) => a.memberId === myMember.id)
      .sort((a, b) => `${a.date}|${a.shiftTypeName}`.localeCompare(`${b.date}|${b.shiftTypeName}`));
  }, [assignments, myMember]);

  const myHours = useMemo(
    () =>
      myAssignments.reduce((acc, a) => {
        const st = shiftTypes.find((s) => s.id === a.shiftTypeId);
        if (!st) return acc;
        const [sh, sm] = st.startTime.split(":").map(Number);
        const [eh, em] = st.endTime.split(":").map(Number);
        const startMin = sh * 60 + sm;
        let endMin = eh * 60 + em;
        if (endMin <= startMin) endMin += 24 * 60;
        return acc + (endMin - startMin) / 60;
      }, 0),
    [myAssignments, shiftTypes],
  );

  const soloMeVisible = myMember && (viewMode === "standard" || viewMode === "calendar");
  const previewZoom = SCHEDULE_PREVIEW_ZOOM_LEVELS[previewZoomIdx];

  return (
    <section className="card mt-3 worker-turns-card border-0 shadow-sm">
      <div className="card-body p-3 p-md-4">
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-3" aria-label="Viste visualizzazione">
          <div className="d-flex align-items-center gap-2 flex-wrap">
            <button
              type="button"
              className={`btn btn-sm ${viewMode === "standard" ? "btn-success" : "btn-outline-success"}`}
              onClick={() => setViewMode("standard")}
            >
              <Image
                src="/dashboard.svg"
                alt=""
                width={20}
                height={20}
                style={{ marginRight: 8, filter: viewMode === "standard" ? "brightness(0) invert(1)" : "none" }}
              />
              Standard
            </button>
            <button
              type="button"
              className={`btn btn-sm ${viewMode === "calendar" ? "btn-success" : "btn-outline-success"}`}
              onClick={() => setViewMode("calendar")}
            >
              <Image
                src="/calendar.svg"
                alt=""
                width={20}
                height={20}
                style={{ marginRight: 8, filter: viewMode === "calendar" ? "brightness(0) invert(1)" : "none" }}
              />
              Calendario
            </button>
            <button
              type="button"
              className={`btn btn-sm ${viewMode === "mine" ? "btn-success" : "btn-outline-success"}`}
              onClick={() => setViewMode("mine")}
            >
              <Image
                src="/my_turni.svg"
                alt=""
                width={20}
                height={20}
                style={{ marginRight: 8, filter: viewMode === "mine" ? "brightness(0) invert(1)" : "none" }}
              />
              I miei turni
            </button>
          </div>
          <div className="d-flex align-items-center gap-2 flex-wrap">
            {viewMode === "standard" || viewMode === "calendar" ? (
              <>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-success d-inline-flex align-items-center justify-content-center px-2"
                  aria-label="Riduci zoom anteprima"
                  title="Riduci zoom"
                  disabled={previewZoomIdx <= 0}
                  onClick={() => setPreviewZoomIdx((i) => Math.max(0, i - 1))}
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    zoom_out
                  </span>
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-success d-inline-flex align-items-center justify-content-center px-2"
                  aria-label="Ingrandisci zoom anteprima"
                  title="Ingrandisci zoom"
                  disabled={previewZoomIdx >= SCHEDULE_PREVIEW_ZOOM_LEVELS.length - 1}
                  onClick={() => setPreviewZoomIdx((i) => Math.min(SCHEDULE_PREVIEW_ZOOM_LEVELS.length - 1, i + 1))}
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    zoom_in
                  </span>
                </button>
              </>
            ) : null}
            {soloMeVisible ? (
              <button
                type="button"
                className={`btn btn-sm d-inline-flex align-items-center justify-content-center p-0 rounded-circle border-2 ${
                  soloMeOnly
                    ? "btn-success border-success"
                    : "btn-outline-success bg-white border-success"
                }`}
                style={{ width: 40, height: 40 }}
                title={soloMeOnly ? "Mostra tutti nei turni" : "Mostra solo i miei turni nelle viste"}
                aria-pressed={soloMeOnly}
                onClick={() => setSoloMeOnly((v) => !v)}
              >
                <span
                  className="material-symbols-outlined"
                  aria-hidden="true"
                  style={{ fontSize: "1.35rem", lineHeight: 1 }}
                >
                  person_search
                </span>
              </button>
            ) : null}
          </div>
        </div>

        {viewMode === "standard" ? (
          <div className="config-grid-zoom-shell w-100 overflow-x-auto" style={{ zoom: previewZoom }}>
            <ScheduleReadonlyStandardTable
              days={days}
              shiftTypes={shiftTypes}
              byCell={byCell}
              memberById={previewMemberColorById}
              isShiftActive={isShiftActivePreview}
            />
          </div>
        ) : null}

        {viewMode === "calendar" ? (
          <div className="config-grid-zoom-shell w-100 overflow-x-auto" style={{ zoom: previewZoom }}>
            <ScheduleReadonlyCalendarWeeks
              calendarWeekRows={calendarWeekRows}
              shiftTypes={shiftTypes}
              byCell={byCell}
              memberById={previewMemberColorById}
              isShiftActive={isShiftActivePreview}
            />
          </div>
        ) : null}

        {viewMode === "mine" ? (
          <div>
            <h2 className="h6 fw-semibold mb-3">I miei turni</h2>
            {!myMember ? (
              <p className="small text-secondary mb-0">Nessun profilo worker associato a questo calendario.</p>
            ) : (
              <>
                <p className="small text-secondary mb-3">
                  Per aggiornare nome, email o password usa <strong>I miei dati</strong> nel menu laterale.
                </p>
                <div className="row g-3 mb-4">
                  <div className="col-md-4">
                    <div className="border rounded-3 p-3 h-100 bg-white shadow-sm">
                      <div className="small text-secondary">Persona</div>
                      <div className="fw-semibold">{myMember.label}</div>
                    </div>
                  </div>
                  <div className="col-md-4">
                    <div className="border rounded-3 p-3 h-100 bg-white shadow-sm">
                      <div className="small text-secondary">Turni nel periodo</div>
                      <div className="fw-semibold">{myAssignments.length}</div>
                    </div>
                  </div>
                  <div className="col-md-4">
                    <div className="border rounded-3 p-3 h-100 bg-white shadow-sm">
                      <div className="small text-secondary">Ore totali (stimato)</div>
                      <div className="fw-semibold">{Math.round(myHours * 10) / 10}</div>
                    </div>
                  </div>
                </div>

                <h3 className="h6 fw-semibold mb-3">Elenco turni</h3>
                {myAssignments.length === 0 ? (
                  <p className="small text-secondary mb-0">Nessun turno assegnato in questo periodo.</p>
                ) : (
                  <ul className="list-unstyled d-grid gap-3 mb-0 worker-shift-card-list">
                    {myAssignments.map((a) => {
                      const st = shiftTypes.find((s) => s.id === a.shiftTypeId);
                      const bar = st?.color ?? a.shiftTypeColor ?? "#1f7a3f";
                      return (
                        <li key={`mine-card-${a.id}`}>
                          <article
                            className="worker-shift-card border rounded-3 overflow-hidden bg-white shadow-sm d-flex"
                            style={{ borderLeftWidth: 5, borderLeftColor: bar }}
                          >
                            <div className="p-3 flex-grow-1 min-w-0">
                              <div className="d-flex flex-wrap align-items-baseline justify-content-between gap-2 mb-1">
                                <time className="fw-semibold text-capitalize" dateTime={a.date}>
                                  {formatDateIt(a.date)}
                                </time>
                                <span className="small text-secondary">{formatDateShort(a.date)}</span>
                              </div>
                              <div className="fw-semibold" style={{ color: bar }}>
                                {a.shiftTypeName}
                              </div>
                              {st ? (
                                <p className="small text-secondary mb-0 mt-1">
                                  {st.startTime} – {st.endTime}
                                </p>
                              ) : null}
                            </div>
                            <div
                              className="d-none d-sm-flex align-items-stretch px-2"
                              style={{ background: `${bar}14`, minWidth: 52 }}
                              aria-hidden
                            />
                          </article>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </>
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}
