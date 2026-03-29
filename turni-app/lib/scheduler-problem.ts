/**
 * Payload JSON inviato al microservizio OR-Tools (`/generate`).
 * `schemaVersion` consente evoluzioni retrocompatibili del contratto "standard calendario".
 */

export const SCHEDULER_PROBLEM_SCHEMA_VERSION = 1;

export type SchedulerCalendarRules = Record<string, unknown>;

export type SchedulerShiftTypePayload = {
  id: string;
  name: string;
  minStaff: number;
  maxStaff: number | null;
  activeWeekdays: number[];
  startTime: string;
  endTime: string;
  durationHours: number;
  /** Derivato da rules / orari (notte, oltre mezzanotte). */
  isNight: boolean;
  /** Se true, il turno in sab/dom conta per i tetti weekend se calendar.rules non dice altro. */
  countsAsWeekend: boolean;
  rules: unknown;
};

export type SchedulerMemberPayload = {
  id: string;
  /** Etichetta leggibile per alert dal solver (opzionale). */
  label?: string | null;
  isJolly: boolean;
  maxConsecutiveDays: number;
  /** Unione indisponibilità (giorni interi). ISO date → chiave ordinata. */
  unavailableDates: string[];
  /** Esclusioni (data, tipo turno) — mensili + generali. */
  unavailableShifts: Array<{ date: string; shiftTypeId: string }>;
  unavailableShiftTypeIdsHard: string[];
  unavailableWeekdaysHard: number[];
  /** Preferenze soft: penalità nell'obiettivo CP-SAT. */
  unavailableShiftTypeIdsSoft: string[];
  unavailableWeekdaysSoft: number[];
  /** Vincoli di periodo: la persona deve lavorare quel giorno (almeno un turno). */
  requiredDates: string[];
  /** Vincoli di periodo: la persona deve essere assegnata a quel tipo turno in quella data. */
  requiredShifts: Array<{ date: string; shiftTypeId: string }>;
  maxShiftsMonth: number | null;
  maxNightsMonth: number | null;
  maxSaturdaysMonth: number | null;
  maxSundaysMonth: number | null;
  /** Da calendar.rules se presente; limite unificato su giorni sab+dom lavorati. */
  maxWeekendDaysMonth: number | null;
};

export type SchedulerFixedAssignment = {
  memberId: string;
  shiftTypeId: string;
  date: string;
};

export type SchedulerProblemPayload = {
  schemaVersion: typeof SCHEDULER_PROBLEM_SCHEMA_VERSION;
  scheduleId: string;
  dates: string[];
  timezone: string;
  /** Se true, vietato lavorare il giorno dopo un turno notte (fisso o generato). */
  restAfterNight: boolean;
  calendarRules: SchedulerCalendarRules | null;
  shiftTypes: SchedulerShiftTypePayload[];
  members: SchedulerMemberPayload[];
  fixedAssignments: SchedulerFixedAssignment[];
  /**
   * Cambia i coefficienti minori nell’obiettivo CP-SAT → piani diversi tra un “Genera” e l’altro se le soluzioni erano equivalenti.
   */
  randomSeed?: number;
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function datesInMonth(year: number, month: number): string[] {
  const dim = new Date(year, month, 0).getDate();
  return Array.from({ length: dim }, (_, i) => `${year}-${pad(month)}-${pad(i + 1)}`);
}

export function datesInRange(startDate: string, endDate: string): string[] {
  const out: string[] = [];
  const d = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  while (d <= end) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

function utcDow(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00.000Z`).getUTCDay();
}

function shiftIsNight(st: { startTime: string; endTime: string; rules: unknown }): boolean {
  const r = st.rules as { isNight?: boolean } | null | undefined;
  if (r?.isNight === true) return true;
  const ps = st.startTime.split(":").map(Number);
  const pe = st.endTime.split(":").map(Number);
  const sh = ps[0] ?? 0;
  const sm = ps[1] ?? 0;
  const eh = pe[0] ?? 0;
  const em = pe[1] ?? 0;
  if (eh < sh || (eh === sh && em < sm)) return true;
  return sh >= 20 || sh < 5;
}

function shiftCountsWeekend(rules: unknown): boolean {
  const r = rules as { counts_as_weekend?: boolean } | null | undefined;
  return r?.counts_as_weekend === true;
}

/** Bugfix loop: iterazione corretta su range */
function addRangeInclusive(out: Set<string>, start: string, end: string, scope: Set<string>) {
  let cur = new Date(`${start}T00:00:00.000Z`);
  const last = new Date(`${end}T00:00:00.000Z`);
  while (cur <= last) {
    const s = cur.toISOString().slice(0, 10);
    if (scope.has(s)) out.add(s);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
}

function expandGeneralUnavailableDates(
  type: string,
  value: unknown,
  scope: Set<string>,
): string[] {
  const out = new Set<string>();
  if (type === "UNAVAILABLE_DATE") {
    const d = (value as { date?: string }).date;
    if (d && scope.has(d)) out.add(d);
  } else if (type === "UNAVAILABLE_DATES") {
    const arr = (value as { dates?: string[] }).dates;
    if (Array.isArray(arr)) for (const d of arr) if (typeof d === "string" && scope.has(d)) out.add(d);
  } else if (type === "UNAVAILABLE_DATERANGE") {
    const v = value as { start?: string; end?: string };
    if (v.start && v.end && v.start <= v.end) addRangeInclusive(out, v.start, v.end, scope);
  }
  return [...out];
}

function numFromRules(rules: SchedulerCalendarRules | null, key: string): number | null {
  if (!rules || typeof rules !== "object") return null;
  const v = rules[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function restAfterNightEnabled(rules: SchedulerCalendarRules | null): boolean {
  if (!rules || typeof rules !== "object") return true;
  const v = (rules as { rest_after_night?: boolean }).rest_after_night;
  if (v === false) return false;
  return true;
}

export function buildSchedulerProblem(params: {
  scheduleId: string;
  dates: string[];
  timezone: string;
  calendarRules: unknown;
  shiftTypes: Array<{
    id: string;
    name: string;
    minStaff: number;
    maxStaff: number | null;
    activeWeekdays: number[];
    startTime: string;
    endTime: string;
    durationHours: number;
    rules: unknown;
  }>;
  members: Array<{
    id: string;
    label?: string | null;
    isJolly: boolean;
    maxConsecutiveDays: number;
    minRestHoursBetweenShifts: number;
    contractShiftsMonth: number | null;
  }>;
  monthlyConstraints: Array<{ memberId: string; type: string; weight: string; value: unknown }>;
  memberConstraints: Array<{ memberId: string; type: string; weight: string; value: unknown; note?: string | null }>;
  fixedAssignments: SchedulerFixedAssignment[];
  /** Da passare a runtime (es. Date.now()) per variare il piano tra due generazioni. */
  randomSeed?: number;
}): SchedulerProblemPayload {
  const scope = new Set(params.dates);
  const calRules = (params.calendarRules as SchedulerCalendarRules | null) ?? null;

  const maxNightsCal = numFromRules(calRules, "max_nights_per_month");
  const maxWeekendsCal = numFromRules(calRules, "max_weekends_per_month");
  /* max_weekends_per_month = coppie o giorni: interpretiamo come max giorni weekend (sab+dom) */
  const maxWeekendDaysCal =
    numFromRules(calRules, "max_weekend_days_per_month") ??
    (maxWeekendsCal != null ? maxWeekendsCal * 2 : null);

  const membersOut: SchedulerMemberPayload[] = params.members.map((m) => {
    const unavailableDates = new Set<string>();
    const unavailableShifts: Array<{ date: string; shiftTypeId: string }> = [];
    const requiredDates = new Set<string>();
    const requiredShifts: Array<{ date: string; shiftTypeId: string }> = [];
    const shiftHard = new Set<string>();
    const shiftSoft = new Set<string>();
    const wdHard = new Set<number>();
    const wdSoft = new Set<number>();

    let maxShiftsMonth: number | null = m.contractShiftsMonth;
    let maxNightsMonth: number | null = maxNightsCal;
    let maxSaturdaysMonth: number | null = null;
    let maxSundaysMonth: number | null = null;
    let maxWeekendDaysMonth: number | null = maxWeekendDaysCal;
    let maxConsecutive = m.maxConsecutiveDays;

    for (const c of params.memberConstraints) {
      if (c.memberId !== m.id) continue;
      if (c.type === "UNAVAILABLE_SHIFT") {
        const sid = (c.value as { shiftTypeId?: string }).shiftTypeId;
        if (!sid) continue;
        if (c.weight === "HARD") shiftHard.add(sid);
        else shiftSoft.add(sid);
      } else if (c.type === "UNAVAILABLE_WEEKDAY") {
        const wd = (c.value as { weekday?: number }).weekday;
        if (typeof wd !== "number") continue;
        if (c.weight === "HARD") wdHard.add(wd);
        else wdSoft.add(wd);
      } else if (c.type === "MAX_SHIFTS_MONTH" && c.weight === "HARD") {
        const v = c.value as { max?: number; count?: number };
        const max = typeof v.max === "number" ? v.max : typeof v.count === "number" ? v.count : null;
        if (max != null) maxShiftsMonth = max;
      } else if (c.type === "NO_WEEKEND" && c.weight === "HARD") {
        for (const ds of params.dates) {
          const dow = utcDow(ds);
          if (dow === 0 || dow === 6) unavailableDates.add(ds);
        }
      } else if (c.type === "MAX_CONSECUTIVE_DAYS" && c.weight === "HARD") {
        const n = (c.value as { days?: number }).days;
        if (typeof n === "number" && n > 0) maxConsecutive = n;
      } else if (c.type === "CUSTOM" && c.weight === "SOFT") {
        const note = c.note ?? undefined;
        const val = c.value as { kind?: string; nights?: number; saturdays?: number; sundays?: number };
        if (note === "TARGET_NIGHTS_MONTH" && val?.kind === "TARGET_NIGHTS_MONTH" && typeof val.nights === "number") {
          maxNightsMonth = val.nights;
        }
        if (note === "TARGET_SATURDAYS_MONTH" && val?.kind === "TARGET_SATURDAYS_MONTH" && typeof val.saturdays === "number") {
          maxSaturdaysMonth = val.saturdays;
        }
        if (note === "TARGET_SUNDAYS_MONTH" && val?.kind === "TARGET_SUNDAYS_MONTH" && typeof val.sundays === "number") {
          maxSundaysMonth = val.sundays;
        }
      }

      for (const d of expandGeneralUnavailableDates(c.type, c.value, scope)) {
        unavailableDates.add(d);
      }
    }

    for (const c of params.monthlyConstraints) {
      if (c.memberId !== m.id) continue;
      if (c.type === "UNAVAILABLE_DATE") {
        const d = (c.value as { date?: string }).date;
        if (d && scope.has(d)) unavailableDates.add(d);
      } else if (c.type === "UNAVAILABLE_SHIFT") {
        const d = (c.value as { date?: string; shiftTypeId?: string }).date;
        const sid = (c.value as { shiftTypeId?: string }).shiftTypeId;
        if (d && sid && scope.has(d)) unavailableShifts.push({ date: d, shiftTypeId: sid });
      } else if (c.type === "REQUIRED_DATE") {
        const d = (c.value as { date?: string }).date;
        if (d && scope.has(d)) requiredDates.add(d);
      } else if (c.type === "REQUIRED_SHIFT") {
        const d = (c.value as { date?: string; shiftTypeId?: string }).date;
        const sid = (c.value as { shiftTypeId?: string }).shiftTypeId;
        if (d && sid && scope.has(d)) requiredShifts.push({ date: d, shiftTypeId: sid });
      }
    }

    return {
      id: m.id,
      ...(m.label != null && String(m.label).trim() !== "" ? { label: String(m.label).trim() } : {}),
      isJolly: m.isJolly,
      maxConsecutiveDays: maxConsecutive,
      unavailableDates: [...unavailableDates].sort(),
      unavailableShifts: unavailableShifts,
      requiredDates: [...requiredDates].sort(),
      requiredShifts,
      unavailableShiftTypeIdsHard: [...shiftHard],
      unavailableWeekdaysHard: [...wdHard].sort(),
      unavailableShiftTypeIdsSoft: [...shiftSoft],
      unavailableWeekdaysSoft: [...wdSoft].sort(),
      maxShiftsMonth,
      maxNightsMonth,
      maxSaturdaysMonth,
      maxSundaysMonth,
      maxWeekendDaysMonth,
    };
  });

  return {
    schemaVersion: SCHEDULER_PROBLEM_SCHEMA_VERSION,
    scheduleId: params.scheduleId,
    dates: params.dates,
    timezone: params.timezone,
    restAfterNight: restAfterNightEnabled(calRules),
    calendarRules: calRules,
    shiftTypes: params.shiftTypes.map((st) => ({
      id: st.id,
      name: st.name,
      minStaff: st.minStaff,
      maxStaff: st.maxStaff,
      activeWeekdays: st.activeWeekdays,
      startTime: st.startTime,
      endTime: st.endTime,
      durationHours: st.durationHours,
      isNight: shiftIsNight(st),
      countsAsWeekend: shiftCountsWeekend(st.rules),
      rules: st.rules,
    })),
    members: membersOut,
    fixedAssignments: params.fixedAssignments,
    ...(params.randomSeed !== undefined ? { randomSeed: params.randomSeed } : {}),
  };
}

export function getRestAfterNightFlag(rules: SchedulerCalendarRules | null): boolean {
  return restAfterNightEnabled(rules);
}
