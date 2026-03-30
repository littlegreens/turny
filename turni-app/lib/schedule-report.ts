/** Calcoli riepilogo schedule (Passo 3 brain): ore, copertura min/max staff. */

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
  memberId: string;
  shiftTypeId: string;
  date: string;
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
}): {
  memberRows: MemberReportRow[];
  coverageAlerts: CoverageAlert[];
  totals: { assignments: number; hours: number; shiftSlotsChecked: number };
} {
  const { year, month, shiftTypes, assignments, members } = input;
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

  let totalHours = 0;
  for (const a of assignments) {
    const st = stById.get(a.shiftTypeId);
    if (!st) continue;
    const h = st.durationHours;
    totalHours += h;
    countByMember.set(a.memberId, (countByMember.get(a.memberId) ?? 0) + 1);
    hoursByMember.set(a.memberId, (hoursByMember.get(a.memberId) ?? 0) + h);
    if (st.isNight) {
      nightsByMember.set(a.memberId, (nightsByMember.get(a.memberId) ?? 0) + 1);
    }
    const dow = utcDow(a.date);
    if (dow === 6) satsByMember.set(a.memberId, (satsByMember.get(a.memberId) ?? 0) + 1);
    if (dow === 0) sunsByMember.set(a.memberId, (sunsByMember.get(a.memberId) ?? 0) + 1);
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

  const coverageAlerts: CoverageAlert[] = [];
  const dim = daysInMonth(year, month);
  let shiftSlotsChecked = 0;

  for (let day = 1; day <= dim; day++) {
    const date = `${year}-${pad2(month)}-${pad2(day)}`;
    for (const st of shiftTypes) {
      if (!st.activeWeekdays.includes(utcDow(date))) continue;
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
    coverageAlerts,
    totals: {
      assignments: assignments.length,
      hours: Math.round(totalHours * 100) / 100,
      shiftSlotsChecked,
    },
  };
}
