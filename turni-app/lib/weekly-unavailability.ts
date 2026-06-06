import { WEEKDAY_OPTIONS } from "@/lib/weekdays";
import type { HolidayOverrideDraft } from "@/lib/holiday-overrides";

export type WeeklySlot = "mattina" | "pomeriggio" | "notte" | "turnoUnico";

export const WEEKLY_SLOT_LABELS: Record<WeeklySlot, string> = {
  mattina: "Mattina",
  pomeriggio: "Pomeriggio",
  notte: "Notte",
  turnoUnico: "Turno unico",
};

export const BASE_WEEKLY_UNAVAIL_NOTE = "BASE_WEEKLY_UNAVAIL";

export type WeeklyShiftType = {
  id: string;
  name: string;
  startTime?: string;
  activeWeekdays?: number[];
};

export type WeeklyConstraintRow = {
  type: string;
  value: unknown;
  note?: string | null;
};

export type WeeklyCell = { weekday: number; slot: WeeklySlot };

export function weeklyCellKey(weekday: number, slot: WeeklySlot): string {
  return `${weekday}|${slot}`;
}

export function slotsForWeekday(weekday: number): WeeklySlot[] {
  if (weekday === 0) return ["turnoUnico", "notte"];
  return ["mattina", "pomeriggio", "notte"];
}

export function slotAppliesOnWeekday(slot: WeeklySlot, weekday: number): boolean {
  return slotsForWeekday(weekday).includes(slot);
}

export function utcDayOfWeek(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00.000Z`).getUTCDay();
}

/** Tipi turno attivi in una data che appartengono alla fascia (Mattina, ecc.). */
export function activeShiftTypesForSlot(
  shiftTypes: WeeklyShiftType[],
  slot: WeeklySlot,
  dateStr: string,
  isShiftActive: (dateStr: string, st: WeeklyShiftType) => boolean,
): WeeklyShiftType[] {
  const dow = utcDayOfWeek(dateStr);
  if (!slotAppliesOnWeekday(slot, dow)) return [];
  return shiftTypes.filter((st) => isShiftActive(dateStr, st) && classifyWeeklySlot(st) === slot);
}

/** Come `activeShiftTypesForSlot`, ma sui giorni festivo/eccezione ignora il layout weekday (es. turno unico il lunedì). */
export function activeShiftTypesForSlotOnDate(
  shiftTypes: WeeklyShiftType[],
  slot: WeeklySlot,
  dateStr: string,
  holidayOverrides: HolidayOverrideDraft[],
  isShiftActive: (dateStr: string, st: WeeklyShiftType) => boolean,
): WeeklyShiftType[] {
  const ov = holidayOverrides.find((h) => h.date === dateStr);
  if (ov && (ov.mode === "FESTIVO" || ov.mode === "CLOSED" || ov.mode === "CUSTOM" || ov.mode === "SUNDAY_LIKE")) {
    return shiftTypes.filter((st) => isShiftActive(dateStr, st) && classifyWeeklySlot(st) === slot);
  }
  return activeShiftTypesForSlot(shiftTypes, slot, dateStr, isShiftActive);
}

/** Fasce da mostrare nel popup persona per una data (layout completo; fasce senza turni attivi restano grigie). */
export function layoutSlotsForDate(
  dateStr: string,
  holidayOverrides: HolidayOverrideDraft[],
  shiftTypes: WeeklyShiftType[],
  isShiftActive: (dateStr: string, st: WeeklyShiftType) => boolean,
): { slots: WeeklySlot[]; sundayLayout: boolean } {
  const dow = utcDayOfWeek(dateStr);
  const pick = (slot: WeeklySlot) =>
    activeShiftTypesForSlotOnDate(shiftTypes, slot, dateStr, holidayOverrides, isShiftActive);

  if (pick("turnoUnico").length > 0) {
    return { slots: ["turnoUnico", "notte"], sundayLayout: true };
  }
  if (dow === 0) {
    return { slots: ["turnoUnico", "notte"], sundayLayout: true };
  }
  return { slots: slotsForWeekday(dow), sundayLayout: false };
}

export function classifyWeeklySlot(st: WeeklyShiftType): WeeklySlot {
  const n = st.name.toLowerCase();
  if (n.includes("notte")) return "notte";
  if (n.includes("unico") || (st.activeWeekdays?.length === 1 && st.activeWeekdays[0] === 0)) return "turnoUnico";
  if (n.includes("pomeriggio")) return "pomeriggio";
  if (n.includes("mattina")) return "mattina";
  const sh = Number(String(st.startTime ?? "08:00").split(":")[0]);
  if (sh >= 18 || sh < 6) return "notte";
  if (sh >= 11) return "pomeriggio";
  return "mattina";
}

export function shiftTypeIdsForWeeklySlot(shiftTypes: WeeklyShiftType[], slot: WeeklySlot, weekday: number): string[] {
  return shiftTypes
    .filter((st) => {
      const wds = st.activeWeekdays ?? [1, 2, 3, 4, 5, 6, 0];
      if (!wds.includes(weekday)) return false;
      return classifyWeeklySlot(st) === slot;
    })
    .map((st) => st.id);
}

function parseSlot(raw: unknown): WeeklySlot | null {
  const s = String(raw ?? "").trim();
  if (s === "mattina" || s === "pomeriggio" || s === "notte" || s === "turnoUnico") return s;
  return null;
}

/** Griglia settimanale da vincoli DB (nuovo + legacy). */
export function parseWeeklyCellsFromConstraints(
  constraints: WeeklyConstraintRow[],
  shiftTypes: WeeklyShiftType[],
): Set<string> {
  const cells = new Set<string>();

  for (const c of constraints) {
    if (c.type === "UNAVAILABLE_WEEKDAY_SHIFT") {
      const wd = Number((c.value as { weekday?: number }).weekday);
      const slot = parseSlot((c.value as { slot?: unknown }).slot);
      if (!Number.isNaN(wd) && wd >= 0 && wd <= 6 && slot && slotAppliesOnWeekday(slot, wd)) {
        cells.add(weeklyCellKey(wd, slot));
      }
      continue;
    }
    if (c.type === "UNAVAILABLE_WEEKDAY") {
      const wd = Number((c.value as { weekday?: number }).weekday);
      if (Number.isNaN(wd) || wd < 0 || wd > 6) continue;
      for (const slot of slotsForWeekday(wd)) cells.add(weeklyCellKey(wd, slot));
      continue;
    }
    if (c.type === "UNAVAILABLE_SHIFT") {
      const sid = String((c.value as { shiftTypeId?: string }).shiftTypeId ?? "");
      const st = shiftTypes.find((x) => x.id === sid);
      if (!st) continue;
      const slot = classifyWeeklySlot(st);
      const wds = st.activeWeekdays ?? [1, 2, 3, 4, 5, 6, 0];
      for (const wd of wds) {
        if (slotAppliesOnWeekday(slot, wd)) cells.add(weeklyCellKey(wd, slot));
      }
    }
  }

  return cells;
}

export function weeklyCellsFromKeys(keys: Iterable<string>): WeeklyCell[] {
  const out: WeeklyCell[] = [];
  for (const k of keys) {
    const [wdRaw, slotRaw] = k.split("|");
    const wd = Number(wdRaw);
    const slot = parseSlot(slotRaw);
    if (!Number.isNaN(wd) && slot) out.push({ weekday: wd, slot });
  }
  return out;
}

/** Coppie ricorrenti «weekday|shiftTypeId» per griglia turni e solver. */
export function buildRecurringBlockedShiftKeys(
  constraints: WeeklyConstraintRow[],
  shiftTypes: WeeklyShiftType[],
): Set<string> {
  const keys = new Set<string>();
  const cells = parseWeeklyCellsFromConstraints(constraints, shiftTypes);

  for (const k of cells) {
    const [wdRaw, slotRaw] = k.split("|");
    const wd = Number(wdRaw);
    const slot = parseSlot(slotRaw);
    if (Number.isNaN(wd) || !slot) continue;
    for (const sid of shiftTypeIdsForWeeklySlot(shiftTypes, slot, wd)) {
      keys.add(`${wd}|${sid}`);
    }
  }

  return keys;
}

export function isRecurringShiftBlocked(
  dow: number,
  shiftTypeId: string,
  blockedKeys: ReadonlySet<string>,
): boolean {
  return blockedKeys.has(`${dow}|${shiftTypeId}`);
}

export function formatWeeklyUnavailabilitySummary(cellKeys: Iterable<string>): string {
  const cellSet = new Set(cellKeys);
  if (cellSet.size === 0) return "Nessuna indisponibilità settimanale.";

  const parts: string[] = [];
  for (const day of WEEKDAY_OPTIONS) {
    const daySlots = slotsForWeekday(day.value);
    const offSlots = daySlots.filter((s) => cellSet.has(weeklyCellKey(day.value, s)));
    if (offSlots.length === 0) continue;
    if (offSlots.length === daySlots.length) {
      parts.push(`${day.label} (tutto il giorno)`);
      continue;
    }
    for (const slot of offSlots) {
      parts.push(`${day.label} ${WEEKLY_SLOT_LABELS[slot].toLowerCase()}`);
    }
  }

  return `Non disponibile: ${parts.join(", ")}.`;
}
