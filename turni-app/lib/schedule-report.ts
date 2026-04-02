/** Calcoli riepilogo schedule (Passo 3 brain): ore, copertura min/max staff. */

import { isShiftActiveOnDate, type HolidayOverrideDraft } from "./holiday-overrides";

export type ShiftTypeForReport = {
  id: string;
  name: string;
  minStaff: number;
  maxStaff: number | null;
  durationHours: number;
  activeWeekdays: number[];
  isNight?: boolean;
};

export type AssignmentForReport = {
  /** Membro calendario; assente se persona extra. */
  memberId?: string;
  shiftTypeId: string;
  date: string;
  guestLabel?: string | null;
  guestColor?: string | null;
};

export type CoverageAlert = {
  kind: "UNDERSTAFFED" | "OVERSTAFFED";
  date: string;
  shiftTypeId: string;
  shiftName: string;
  count: number;
  minStaff: number;
  maxStaff: number | null;
};

export type MemberReportRow = {
  memberId: string;
  label: string;
  email: string;
  professionalRole: string;
  shiftCount: number;
  nightCount: number;
  satCount: number;
  sunCount: number;
  hoursTotal: number;
  contractMode: "SHIFTS" | "HOURS";
};

/** Persone extra (tappabuchi) aggregate per nome+colore. */
export type ExtraReportRow = {
  key: string;
  label: string;
  color: string | null;
  shiftCount: number;
  hoursTotal: number;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

export function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function utcDow(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00.000Z`).getUTCDay();
}

export function buildScheduleReport(input: {
  year: number;
  month: number;
  shiftTypes: ShiftTypeForReport[];
  assignments: AssignmentForReport[];
  members: {
    id: string;
    label: string;
    email: string;
    professionalRole: string;
    contractMode: "SHIFTS" | "HOURS";
  }[];
  /** Da calendar.rules (festivi) — stessa forma di `parseHolidayOverrides`. */
  holidayOverrides?: HolidayOverrideDraft[];
}): {
  memberRows: MemberReportRow[];
  extraRows: ExtraReportRow[];
  coverageAlerts: CoverageAlert[];
  totals: { assignments: number; hours: number; shiftSlotsChecked: number };
} {
  const { year, month, shiftTypes, assignments, members } = input;
  const hol = input.holidayOverrides ?? [];
  const stById = new Map(shiftTypes.map((s) => [s.id, s]));

  const hoursByMember = new Map<string, number>();
  const countByMember = new Map<string, number>();
  const nightsByMember = new Map<string, number>();
  const satsByMember = new Map<string, number>();
  const sunsByMember = new Map<string, number>();
  for (const m of members) {
    hoursByMember.set(m.id, 0);
    countByMember.set(m.id, 0);
    nightsByMember.set(m.id, 0);
    satsByMember.set(m.id, 0);
    sunsByMember.set(m.id, 0);
  }

  const extraCount = new Map<string, number>();
  const extraHours = new Map<string, number>();
  const extraMeta = new Map<string, { label: string; color: string | null }>();

  let totalHours = 0;
  for (const a of assignments) {
    const st = stById.get(a.shiftTypeId);
    if (!st) continue;
    const h = st.durationHours;
    totalHours += h;
    const mid = a.memberId;
    const gl = (a.guestLabel ?? "").trim();
    if (mid) {
      countByMember.set(mid, (countByMember.get(mid) ?? 0) + 1);
      hoursByMember.set(mid, (hoursByMember.get(mid) ?? 0) + h);
      if (st.isNight) {
        nightsByMember.set(mid, (nightsByMember.get(mid) ?? 0) + 1);
      }
      const dow = utcDow(a.date);
      if (dow === 6) satsByMember.set(mid, (satsByMember.get(mid) ?? 0) + 1);
      if (dow === 0) sunsByMember.set(mid, (sunsByMember.get(mid) ?? 0) + 1);
    } else if (gl) {
      const ck = `g:${gl}|${a.guestColor ?? ""}`;
      extraCount.set(ck, (extraCount.get(ck) ?? 0) + 1);
      extraHours.set(ck, (extraHours.get(ck) ?? 0) + h);
      extraMeta.set(ck, { label: gl, color: a.guestColor ?? null });
    }
  }

  const memberRows: MemberReportRow[] = members.map((m) => ({
    memberId: m.id,
    label: m.label,
    email: m.email,
    professionalRole: m.professionalRole,
    shiftCount: countByMember.get(m.id) ?? 0,
    nightCount: nightsByMember.get(m.id) ?? 0,
    satCount: satsByMember.get(m.id) ?? 0,
    sunCount: sunsByMember.get(m.id) ?? 0,
    hoursTotal: Math.round((hoursByMember.get(m.id) ?? 0) * 100) / 100,
    contractMode: m.contractMode,
  }));

  const extraRows: ExtraReportRow[] = [...extraMeta.entries()]
    .map(([key, meta]) => ({
      key,
      label: meta.label,
      color: meta.color,
      shiftCount: extraCount.get(key) ?? 0,
      hoursTotal: Math.round((extraHours.get(key) ?? 0) * 100) / 100,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "it"));

  const coverageAlerts: CoverageAlert[] = [];
  const dim = daysInMonth(year, month);
  let shiftSlotsChecked = 0;

  for (let day = 1; day <= dim; day++) {
    const date = `${year}-${pad2(month)}-${pad2(day)}`;
    const dow = utcDow(date);
    for (const st of shiftTypes) {
      if (!isShiftActiveOnDate(hol, date, dow, st.id, st.activeWeekdays)) continue;
      shiftSlotsChecked += 1;
      const count = assignments.filter((x) => x.date === date && x.shiftTypeId === st.id).length;
      if (count < st.minStaff) {
        coverageAlerts.push({
          kind: "UNDERSTAFFED",
          date,
          shiftTypeId: st.id,
          shiftName: st.name,
          count,
          minStaff: st.minStaff,
          maxStaff: st.maxStaff,
        });
      }
      if (st.maxStaff != null && count > st.maxStaff) {
        coverageAlerts.push({
          kind: "OVERSTAFFED",
          date,
          shiftTypeId: st.id,
          shiftName: st.name,
          count,
          minStaff: st.minStaff,
          maxStaff: st.maxStaff,
        });
      }
    }
  }

  return {
    memberRows: memberRows.sort((a, b) => a.label.localeCompare(b.label, "it")),
    extraRows,
    coverageAlerts,
    totals: {
      assignments: assignments.length,
      hours: Math.round(totalHours * 100) / 100,
      shiftSlotsChecked,
    },
  };
}
