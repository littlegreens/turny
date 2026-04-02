"use client";

import type { RefObject } from "react";

/** Stessi livelli del configuratore griglia (coerenza responsabile / worker). */
export const SCHEDULE_PREVIEW_ZOOM_LEVELS = [0.72, 0.82, 0.92, 1, 1.12, 1.26, 1.42] as const;

export type SchedulePreviewAssignment = {
  id: string;
  memberId: string;
  isGuest?: boolean;
  guestColor?: string | null;
  shiftTypeId: string;
  date: string;
  memberLabel: string;
  shiftTypeColor: string;
};

export type SchedulePreviewShiftType = {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  color: string;
  activeWeekdays: number[];
  minStaff: number;
};

export type SchedulePreviewMemberColor = {
  memberColor: string | null;
};

export type SchedulePreviewDay = {
  dateStr: string;
  day: number;
  weekday: string;
};

export function utcDayOfWeek(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00.000Z`).getUTCDay();
}

export function buildSchedulePreviewCalendarWeekRows(dates: string[]): (SchedulePreviewDay | null)[][] {
  const cells: SchedulePreviewDay[] = dates.map((dateStr) => {
    const dt = new Date(`${dateStr}T00:00:00.000Z`);
    return {
      dateStr,
      day: dt.getUTCDate(),
      weekday: new Intl.DateTimeFormat("it-IT", { weekday: "short" }).format(dt),
    };
  });
  const rows: (SchedulePreviewDay | null)[][] = [];
  if (cells.length === 0) return rows;
  let row: (SchedulePreviewDay | null)[] = [];
  const lead = (utcDayOfWeek(cells[0].dateStr) + 6) % 7;
  for (let i = 0; i < lead; i++) row.push(null);
  for (const d of cells) {
    row.push(d);
    if (row.length === 7) {
      rows.push(row);
      row = [];
    }
  }
  if (row.length > 0) {
    while (row.length < 7) row.push(null);
    rows.push(row);
  }
  return rows;
}

export function schedulePreviewChipColors(
  a: SchedulePreviewAssignment,
  memberById: Map<string, SchedulePreviewMemberColor>,
): { previewBg: string; previewColor: string } {
  if (a.isGuest) {
    const c = a.guestColor ?? "#6b7280";
    return { previewBg: `${c}1f`, previewColor: c };
  }
  const m = memberById.get(a.memberId);
  const stdColor = m?.memberColor ?? "#1f2937";
  return {
    previewBg: m?.memberColor ? `${m.memberColor}1f` : `${a.shiftTypeColor}2a`,
    previewColor: stdColor,
  };
}

type StandardProps = {
  days: SchedulePreviewDay[];
  shiftTypes: SchedulePreviewShiftType[];
  byCell: Map<string, SchedulePreviewAssignment[]>;
  memberById: Map<string, SchedulePreviewMemberColor>;
  isShiftActive: (dateStr: string, st: SchedulePreviewShiftType) => boolean;
  rowUndersupplied?: (dateStr: string) => boolean;
  cellUndersupplied?: (dateStr: string, shiftTypeId: string) => boolean;
  tableRef?: RefObject<HTMLDivElement | null>;
};

export function ScheduleReadonlyStandardTable({
  days,
  shiftTypes,
  byCell,
  memberById,
  isShiftActive,
  rowUndersupplied,
  cellUndersupplied,
  tableRef,
}: StandardProps) {
  return (
    <div className="table-responsive" ref={tableRef}>
      <table className="table table-bordered align-middle mb-0" style={{ minWidth: 880, tableLayout: "fixed" }}>
        <thead className="position-sticky top-0 bg-white" style={{ zIndex: 2 }}>
          <tr>
            <th style={{ width: 100 }}>Giorno</th>
            {shiftTypes.map((st) => (
              <th key={`preview-${st.id}`} className="text-center">
                <div className="fw-semibold">{st.name}</div>
                <div className="small text-secondary">
                  {st.startTime} - {st.endTime}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {days.map((d) => {
            const rowGapPrev = rowUndersupplied?.(d.dateStr) ?? false;
            return (
              <tr key={`preview-row-${d.dateStr}`} style={{ height: 60 }}>
                <th
                  className="p-0 align-middle ps-1 small"
                  style={rowGapPrev ? { boxShadow: "inset 4px 0 0 #dc3545" } : undefined}
                  title={rowGapPrev ? "Giorno con almeno uno slot sotto il minimo" : undefined}
                >
                  <div className="fw-semibold">{d.day}</div>
                  <div className="small text-secondary text-capitalize">{d.weekday}</div>
                </th>
                {shiftTypes.map((st) => {
                  const cell = byCell.get(`${d.dateStr}|${st.id}`) ?? [];
                  const shiftInactive = !isShiftActive(d.dateStr, st);
                  const underStaffP = !shiftInactive && (cellUndersupplied?.(d.dateStr, st.id) ?? false);
                  return (
                    <td
                      key={`preview-${d.dateStr}-${st.id}`}
                      className="align-middle p-0"
                      style={{
                        background: shiftInactive ? "#f8f9fa" : `${st.color}14`,
                        height: 60,
                        minHeight: 60,
                        maxHeight: 60,
                        verticalAlign: "middle",
                        boxShadow: underStaffP ? "inset 0 0 0 2px #dc3545" : undefined,
                      }}
                      title={underStaffP ? `Sottocopertura: ${cell.length}/${st.minStaff}` : undefined}
                    >
                      <div className="d-flex flex-wrap gap-1 align-items-center px-1" style={{ minHeight: 60 }}>
                        {cell.map((a) => {
                          const { previewBg, previewColor } = schedulePreviewChipColors(a, memberById);
                          return (
                            <span
                              key={`preview-chip-${a.id}`}
                              className="d-inline-flex align-items-center rounded-2 px-3 py-2 small fw-semibold"
                              style={{ backgroundColor: previewBg, color: previewColor }}
                            >
                              {a.isGuest ? "· " : ""}
                              {a.memberLabel}
                            </span>
                          );
                        })}
                      </div>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

type CalendarProps = {
  calendarWeekRows: (SchedulePreviewDay | null)[][];
  shiftTypes: SchedulePreviewShiftType[];
  byCell: Map<string, SchedulePreviewAssignment[]>;
  memberById: Map<string, SchedulePreviewMemberColor>;
  isShiftActive: (dateStr: string, st: SchedulePreviewShiftType) => boolean;
  rowUndersupplied?: (dateStr: string) => boolean;
  cellUndersupplied?: (dateStr: string, shiftTypeId: string) => boolean;
  calendarRef?: RefObject<HTMLDivElement | null>;
};

export function ScheduleReadonlyCalendarWeeks({
  calendarWeekRows,
  shiftTypes,
  byCell,
  memberById,
  isShiftActive,
  rowUndersupplied,
  cellUndersupplied,
  calendarRef,
}: CalendarProps) {
  return (
    <div ref={calendarRef} className="preview-calendar-weeks">
      <div
        className="calendar-dow-header d-grid gap-1 small text-secondary fw-semibold text-center mb-1"
        style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}
      >
        {["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"].map((h) => (
          <div key={h} className="py-1">
            {h}
          </div>
        ))}
      </div>
      {calendarWeekRows.map((week, wi) => (
        <div
          key={`cal-week-${wi}`}
          className="calendar-week-row d-grid gap-2 mb-2"
          style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}
        >
          {week.map((d, di) => {
            if (!d) {
              return (
                <div
                  key={`cal-empty-${wi}-${di}`}
                  className="calendar-day-cell calendar-day-cell--empty rounded-3 bg-light border border-light"
                  aria-hidden="true"
                />
              );
            }
            const shiftTypesThisDay = shiftTypes.filter((st) => isShiftActive(d.dateStr, st));
            const dayGap = rowUndersupplied?.(d.dateStr) ?? false;
            return (
              <div key={`cal-${d.dateStr}`} className="calendar-day-cell min-w-0">
                <div
                  className={`rounded-3 p-2 bg-white h-100 d-flex flex-column ${dayGap ? "border border-2 border-danger" : "border"}`}
                  style={{ minHeight: 200 }}
                  title={dayGap ? "Giorno con almeno uno slot sotto il minimo organico" : undefined}
                >
                  <p className="fw-semibold mb-2 small mb-1">
                    <span className="text-capitalize">{d.weekday}</span> {d.day}
                  </p>
                  <div className="d-grid gap-1 flex-grow-1 align-content-start">
                    {shiftTypesThisDay.map((st) => {
                      const cell = byCell.get(`${d.dateStr}|${st.id}`) ?? [];
                      const underStaffC = cellUndersupplied?.(d.dateStr, st.id) ?? false;
                      return (
                        <div
                          key={`cal-${d.dateStr}-${st.id}`}
                          className="rounded-2 p-2 d-flex flex-column"
                          style={{
                            background: `${st.color}18`,
                            minHeight: 56,
                            boxShadow: underStaffC ? "inset 0 0 0 2px #dc3545" : undefined,
                          }}
                          title={underStaffC ? `Sottocopertura: ${cell.length}/${st.minStaff}` : undefined}
                        >
                          <div className="small fw-semibold" style={{ fontSize: "0.7rem" }}>
                            {st.name}{" "}
                            <span className="text-secondary fw-normal">
                              {st.startTime}-{st.endTime}
                            </span>
                          </div>
                          <div className="d-flex flex-wrap gap-1 mt-1 flex-grow-1 align-items-center">
                            {cell.length === 0 ? <span className="small text-secondary">—</span> : null}
                            {cell.slice(0, 3).map((a) => {
                              const { previewBg, previewColor } = schedulePreviewChipColors(a, memberById);
                              return (
                                <span
                                  key={`cal-chip-${a.id}`}
                                  className="d-inline-flex rounded-2 px-2 py-1 small fw-semibold"
                                  style={{
                                    backgroundColor: previewBg,
                                    color: previewColor,
                                    fontSize: "0.7rem",
                                  }}
                                >
                                  {a.isGuest ? "· " : ""}
                                  {a.memberLabel}
                                </span>
                              );
                            })}
                            {cell.length > 3 ? (
                              <span className="badge text-bg-light">+{cell.length - 3}</span>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
