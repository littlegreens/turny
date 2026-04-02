/**
 * Payload JSON inviato al microservizio OR-Tools (`/generate`).
 * `schemaVersion` consente evoluzioni retrocompatibili del contratto "standard calendario".
 */
import { parseHolidayOverrides } from "./holiday-overrides";
import { parseProfessionalRoles } from "./professional-roles";

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
  /**
   * Requisiti di composizione per ruolo (minimi) risolti lato Next.
   * `memberIds` è l’insieme membri che “contano” per quel ruolo.
   */
  roleCoverage?: Array<{ role: string; memberIds: string[]; minCount: number }>;
  rules: unknown;
};

export type SchedulerMemberPayload = {
  id: string;
  /** Etichetta leggibile per alert dal solver (opzionale). */
  label?: string | null;
  /** Ruolo (stringa) usato per espandere regole ROLE:* (opzionale). */
  role?: string | null;
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
  /** Date (ISO) in cui il periodo annulla il vincolo generale «giorno settimana non disp.». */
  weekdayUnlockDates?: string[];
  /** Coppie «data|shiftTypeId» in cui il periodo annulla il vincolo generale «evita questa fascia». */
  shiftGenericUnlock?: string[];
  maxShiftsMonth: number | null;
  maxNightsMonth: number | null;
  maxSaturdaysMonth: number | null;
  maxSundaysMonth: number | null;
  /** Da calendar.rules se presente; limite unificato su giorni sab+dom lavorati. */
  maxWeekendDaysMonth: number | null;
};

export type SchedulerFixedAssignment = {
  shiftTypeId: string;
  date: string;
  /** Assegnazione membro calendario (normale). */
  memberId?: string;
  /** Persone extra già in griglia: contano sulla copertura, non sono variabili nel solver. */
  isGuestFixed?: boolean;
};

export type SchedulerCoPresenceRule = {
  id: string;
  name: string;
  kind: "ALWAYS_WITH" | "NEVER_WITH";
  /** SOFT (default, retrocompat): penalità + alert se violata. HARD: vincolo diretto, mai violabile. */
  weight?: "SOFT" | "HARD";
  ifMemberIds: string[];
  thenMemberIds: string[];
  /** Se vuoto: applica su tutte le date del periodo. */
  dates?: string[];
  /** Se valorizzato: regola valida solo sui turni inclusi. */
  shiftTypeIds?: string[];
  /** Se valorizzato: esclude questi turni dalla regola. */
  excludeShiftTypeIds?: string[];
};

export type SchedulerProblemPayload = {
  schemaVersion: typeof SCHEDULER_PROBLEM_SCHEMA_VERSION;
  scheduleId: string;
  dates: string[];
  timezone: string;
  /** Se true, vietato lavorare il giorno dopo un turno notte (fisso o generato). */
  restAfterNight: boolean;
  restDaysAfterNight?: number;
  calendarRules: SchedulerCalendarRules | null;
  dowRules?: Array<{ id: string; name: string; kind: string; fromDow: number; toDow: number; fromShiftTypeId?: string; toShiftTypeId?: string }>;
  shiftTypes: SchedulerShiftTypePayload[];
  members: SchedulerMemberPayload[];
  fixedAssignments: SchedulerFixedAssignment[];
  coPresenceRules?: SchedulerCoPresenceRule[];
  /** Giorni festivi / chiusure / fasce custom da `calendar.rules.holidayOverrides`. */
  holidayOverrides?: Array<{ date: string; mode: string; shiftTypeIds?: string[] }>;
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

export function shiftIsNight(st: { startTime: string; endTime: string; rules: unknown }): boolean {
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
  const cur = new Date(`${start}T00:00:00.000Z`);
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

function restDaysAfterNight(rules: SchedulerCalendarRules | null): number {
  if (!rules || typeof rules !== "object") return 1;
  const v = (rules as { rest_days_after_night?: number }).rest_days_after_night;
  return typeof v === "number" && v >= 1 ? Math.min(Math.floor(v), 3) : 1;
}

function extractDowRules(rules: SchedulerCalendarRules | null): Array<{ id: string; name: string; kind: string; fromDow: number; toDow: number; fromShiftTypeId?: string; toShiftTypeId?: string }> {
  if (!rules || typeof rules !== "object") return [];
  const list = (rules as { dowRules?: unknown }).dowRules;
  if (!Array.isArray(list)) return [];
  return list
    .filter((r): r is Record<string, unknown> => Boolean(r && typeof r === "object"))
    .map((r) => ({
      id: String(r.id ?? ""),
      name: String(r.name ?? ""),
      kind: String(r.kind ?? ""),
      weight: String(r.weight ?? "SOFT"),
      fromDow: Number(r.fromDow ?? 0),
      toDow: Number(r.toDow ?? 0),
      fromShiftTypeId: r.fromShiftTypeId ? String(r.fromShiftTypeId) : undefined,
      toShiftTypeId: r.toShiftTypeId ? String(r.toShiftTypeId) : undefined,
    }))
    .filter((r) => r.kind === "DAY_IMPLIES_DAY" || r.kind === "DAY_EXCLUDES_DAY");
}

export function buildSchedulerProblem(params: {
  scheduleId: string;
  dates: string[];
  timezone: string;
  calendarRules: unknown;
  scheduleRules?: unknown;
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
    role?: string | null;
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
  const schedRules = (params.scheduleRules as { coPresenceRules?: unknown } | null) ?? null;
  const calCoRaw =
    calRules && typeof calRules === "object" ? (calRules as { coPresenceRules?: unknown }).coPresenceRules : null;
  const schedCoRaw =
    schedRules && typeof schedRules === "object" ? (schedRules as { coPresenceRules?: unknown }).coPresenceRules : null;
  const coPresenceRulesRaw: unknown[] = [
    ...(Array.isArray(calCoRaw) ? calCoRaw : []),
    ...(Array.isArray(schedCoRaw) ? schedCoRaw : []),
  ];

  const roleToMemberIds = new Map<string, string[]>();
  for (const m of params.members) {
    const roles = parseProfessionalRoles(String(m.role ?? ""));
    for (const role of roles) {
      const key = role.toLowerCase();
      const list = roleToMemberIds.get(key) ?? [];
      list.push(m.id);
      roleToMemberIds.set(key, list);
    }
  }

  function selectorsToMemberIds(selectors: unknown): string[] {
    if (!Array.isArray(selectors)) return [];
    const out = new Set<string>();
    for (const s of selectors) {
      const raw = String(s ?? "").trim();
      if (!raw) continue;
      if (raw.startsWith("MEMBER:")) {
        const id = raw.slice("MEMBER:".length).trim();
        if (id) out.add(id);
        continue;
      }
      if (raw.startsWith("ROLE:")) {
        const role = raw.slice("ROLE:".length).trim().toLowerCase();
        const ids = roleToMemberIds.get(role) ?? [];
        for (const id of ids) out.add(id);
        continue;
      }
    }
    return [...out];
  }

  const coPresenceRules =
    coPresenceRulesRaw.length > 0
      ? (coPresenceRulesRaw as Array<Record<string, unknown>>).flatMap((r) => {
        if (!r || typeof r !== "object") return [];
        const kind = r.kind === "NEVER_WITH" ? "NEVER_WITH" : r.kind === "ALWAYS_WITH" ? "ALWAYS_WITH" : null;
        if (!kind) return [];
        const ifSelectors = (r as { ifSelectors?: unknown }).ifSelectors;
        const thenSelectors = (r as { thenSelectors?: unknown }).thenSelectors;
        const ifFromSel = selectorsToMemberIds(ifSelectors);
        const thenFromSel = selectorsToMemberIds(thenSelectors);
        const ifMemberIds =
          ifFromSel.length > 0
            ? ifFromSel
            : Array.isArray((r as { ifMemberIds?: unknown }).ifMemberIds)
              ? (r as { ifMemberIds: unknown[] }).ifMemberIds.map(String)
              : [];
        const thenMemberIds =
          thenFromSel.length > 0
            ? thenFromSel
            : Array.isArray((r as { thenMemberIds?: unknown }).thenMemberIds)
              ? (r as { thenMemberIds: unknown[] }).thenMemberIds.map(String)
              : [];
        const ifIds = Array.isArray(ifMemberIds) ? ifMemberIds.filter(Boolean) : [];
        const thenIds = Array.isArray(thenMemberIds) ? thenMemberIds.filter(Boolean) : [];
        if (!ifIds.length || !thenIds.length) return [];
        const datesRaw = Array.isArray((r as { dates?: unknown }).dates)
          ? ((r as { dates: unknown[] }).dates.map(String).filter(Boolean) as string[])
          : undefined;
        const whenDow = (r as { whenDow?: unknown }).whenDow;
        const excludeDow = (r as { excludeDow?: unknown }).excludeDow;
        const whenShiftTypeId = (r as { whenShiftTypeId?: unknown }).whenShiftTypeId;
        const excludeShiftTypeId = (r as { excludeShiftTypeId?: unknown }).excludeShiftTypeId;
        const fromDates = datesRaw && datesRaw.length ? datesRaw.filter((d) => scope.has(d)) : params.dates;
        const filteredDates = fromDates.filter((d) => {
          const dow = utcDow(d);
          if (typeof whenDow === "number" && dow !== whenDow) return false;
          if (typeof excludeDow === "number" && dow === excludeDow) return false;
          return true;
        });
        if (!filteredDates.length) return [];
        const includeShiftTypeIds = typeof whenShiftTypeId === "string" && whenShiftTypeId.trim() ? [whenShiftTypeId.trim()] : undefined;
        const excludeShiftTypeIds = typeof excludeShiftTypeId === "string" && excludeShiftTypeId.trim() ? [excludeShiftTypeId.trim()] : undefined;
        const rawWeight = String((r as { weight?: unknown }).weight ?? "SOFT").toUpperCase();
        const coWeight: "SOFT" | "HARD" = rawWeight === "HARD" ? "HARD" : "SOFT";
        return [
          {
            id: String((r as { id?: unknown }).id || ""),
            name: String((r as { name?: unknown }).name || ""),
            kind,
            weight: coWeight,
            ifMemberIds: ifIds,
            thenMemberIds: thenIds,
            dates: filteredDates,
            ...(includeShiftTypeIds ? { shiftTypeIds: includeShiftTypeIds } : {}),
            ...(excludeShiftTypeIds ? { excludeShiftTypeIds } : {}),
          } satisfies SchedulerCoPresenceRule,
        ];
      })
      : [];

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
    const weekdayUnlockDates = new Set<string>();
    const shiftGenericUnlock = new Set<string>();
    const shiftHard = new Set<string>();
    const shiftSoft = new Set<string>();
    const wdHard = new Set<number>();
    const wdSoft = new Set<number>();

    let maxShiftsMonth: number | null = m.contractShiftsMonth;
    let maxNightsMonth: number | null = maxNightsCal;
    let maxSaturdaysMonth: number | null = null;
    let maxSundaysMonth: number | null = null;
    const maxWeekendDaysMonth: number | null = maxWeekendDaysCal;
    let maxConsecutive = m.maxConsecutiveDays;

    for (const c of params.memberConstraints) {
      if (c.memberId !== m.id) continue;
      if (c.type === "UNAVAILABLE_SHIFT") {
        const sid = (c.value as { shiftTypeId?: string }).shiftTypeId;
        if (!sid) continue;
        // Nel configuratore le indisponibilita generali devono valere subito nel solve:
        // se sono salvate come SOFT le trattiamo comunque come vincolo effettivo.
        shiftHard.add(sid);
        if (c.weight !== "HARD") shiftSoft.add(sid);
      } else if (c.type === "UNAVAILABLE_WEEKDAY") {
        const wd = (c.value as { weekday?: number }).weekday;
        if (typeof wd !== "number") continue;
        // Stessa logica dei turni: anche i weekdays SOFT vengono applicati nel solve.
        wdHard.add(wd);
        if (c.weight !== "HARD") wdSoft.add(wd);
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
      } else if (c.type === "CUSTOM") {
        const note = c.note ?? undefined;
        const val = c.value as { kind?: string; shifts?: number; nights?: number; saturdays?: number; sundays?: number };
        if (
          (note === "TARGET_SHIFTS_MONTH" || note === "TARGET_SHIFTS_WEEK") &&
          typeof val.shifts === "number"
        ) {
          maxShiftsMonth = val.shifts;
        }
        if (c.weight === "SOFT") {
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
      } else if (c.type === "CUSTOM") {
        const note = String(c.note ?? "").trim();
        const v = c.value as { date?: string; shiftTypeId?: string };
        const d = v.date;
        if (!d || !scope.has(d)) continue;
        if (note === "GENERIC_DAY_UNLOCK") {
          weekdayUnlockDates.add(d);
        } else if (note === "GENERIC_SHIFT_UNLOCK") {
          const sid = v.shiftTypeId;
          if (sid) shiftGenericUnlock.add(`${d}|${sid}`);
        }
      }
    }

    // Unlock e DEVE vincono su indisponibilità generali: pulire le liste prima di costruire il payload.
    for (const d of weekdayUnlockDates) unavailableDates.delete(d);
    for (const d of requiredDates) unavailableDates.delete(d);
    for (const rs of requiredShifts) {
      unavailableDates.delete(rs.date);
    }

    const cleanShifts = unavailableShifts.filter((us) => {
      if (weekdayUnlockDates.has(us.date)) return false;
      if (shiftGenericUnlock.has(`${us.date}|${us.shiftTypeId}`)) return false;
      if (requiredShifts.some((rs) => rs.date === us.date && rs.shiftTypeId === us.shiftTypeId)) return false;
      return true;
    });

    return {
      id: m.id,
      ...(m.label != null && String(m.label).trim() !== "" ? { label: String(m.label).trim() } : {}),
      ...(m.role != null && String(m.role).trim() !== "" ? { role: String(m.role).trim() } : {}),
      isJolly: m.isJolly,
      maxConsecutiveDays: maxConsecutive,
      unavailableDates: [...unavailableDates].sort(),
      unavailableShifts: cleanShifts,
      requiredDates: [...requiredDates].sort(),
      requiredShifts,
      ...(weekdayUnlockDates.size ? { weekdayUnlockDates: [...weekdayUnlockDates].sort() } : {}),
      ...(shiftGenericUnlock.size ? { shiftGenericUnlock: [...shiftGenericUnlock].sort() } : {}),
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

  const holidayFromCalendar = parseHolidayOverrides(calRules);
  const holidayFromSchedule = parseHolidayOverrides(schedRules);
  const holidayMergedByDate = (() => {
    const m = new Map<string, (typeof holidayFromCalendar)[number]>();
    for (const h of holidayFromCalendar) m.set(h.date, h);
    for (const h of holidayFromSchedule) m.set(h.date, h);
    return [...m.values()];
  })();

  const holidayForSolver = holidayMergedByDate.map((h) => ({
    date: h.date,
    mode: h.mode,
    ...(h.shiftTypeIds?.length ? { shiftTypeIds: h.shiftTypeIds } : {}),
  }));

  function roleCoverageForShiftType(st: { minStaff: number; rules: unknown }) {
    const r = st.rules as { roleSlots?: unknown } | null | undefined;
    const rawSlots = Array.isArray(r?.roleSlots) ? (r!.roleSlots as unknown[]) : [];
    const slots = Array.from({ length: Math.max(1, st.minStaff) }, (_, i) => {
      const v = rawSlots[i];
      return typeof v === "string" && v.trim() ? v.trim() : null;
    });
    const counts = new Map<string, number>();
    for (const role of slots) {
      if (!role) continue;
      const key = role.toLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    if (counts.size === 0) return null;
    const out = [...counts.entries()]
      .map(([roleLower, minCount]) => ({
        role: roleLower,
        memberIds: roleToMemberIds.get(roleLower) ?? [],
        minCount,
      }))
      .filter((x) => x.minCount > 0);
    return out.length ? out : null;
  }

  return {
    schemaVersion: SCHEDULER_PROBLEM_SCHEMA_VERSION,
    scheduleId: params.scheduleId,
    dates: params.dates,
    timezone: params.timezone,
    restAfterNight: restAfterNightEnabled(calRules),
    restDaysAfterNight: restDaysAfterNight(calRules),
    calendarRules: calRules,
    ...(extractDowRules(calRules).length ? { dowRules: extractDowRules(calRules) } : {}),
    ...(holidayForSolver.length ? { holidayOverrides: holidayForSolver } : {}),
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
      ...(roleCoverageForShiftType(st) ? { roleCoverage: roleCoverageForShiftType(st)! } : {}),
      rules: st.rules,
    })),
    members: membersOut,
    fixedAssignments: params.fixedAssignments,
    ...(coPresenceRules.length ? { coPresenceRules } : {}),
    ...(params.randomSeed !== undefined ? { randomSeed: params.randomSeed } : {}),
  };
}

export function getRestAfterNightFlag(rules: SchedulerCalendarRules | null): boolean {
  return restAfterNightEnabled(rules);
}
