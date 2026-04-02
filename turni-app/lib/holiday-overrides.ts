/**
 * Giorni straordinari / festivi in `calendar.rules.holidayOverrides`.
 * Allineato a `activeWeekdays` sui tipi turno (0 = dom … 6 = sab, come JS UTC).
 */

export type HolidayOverrideMode = "CLOSED" | "SUNDAY_LIKE" | "CUSTOM";

export type HolidayOverrideDraft = {
  id: string;
  date: string;
  mode: HolidayOverrideMode;
  /** Solo se mode === CUSTOM: id tipi turno ammessi quel giorno */
  shiftTypeIds?: string[];
};

function newHolidayId(): string {
  if (typeof globalThis.crypto !== "undefined" && "randomUUID" in globalThis.crypto) {
    return globalThis.crypto.randomUUID();
  }
  return `h-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export function parseHolidayOverrides(rules: unknown): HolidayOverrideDraft[] {
  if (!rules || typeof rules !== "object") return [];
  const raw = (rules as { holidayOverrides?: unknown }).holidayOverrides;
  if (!Array.isArray(raw)) return [];
  const out: HolidayOverrideDraft[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const id = String(o.id ?? "");
    const date = String(o.date ?? "").trim();
    const modeRaw = String(o.mode ?? "").toUpperCase();
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const mode: HolidayOverrideMode =
      modeRaw === "CLOSED" ? "CLOSED" : modeRaw === "CUSTOM" ? "CUSTOM" : "SUNDAY_LIKE";
    const st = o.shiftTypeIds;
    const shiftTypeIds = Array.isArray(st) ? st.map((x) => String(x)).filter(Boolean) : undefined;
    out.push({ id: id || newHolidayId(), date, mode, ...(mode === "CUSTOM" && shiftTypeIds?.length ? { shiftTypeIds } : {}) });
  }
  return out;
}

/** Giorno effettivamente chiuso (nessuna fascia). */
export function isDateClosedByHoliday(overrides: HolidayOverrideDraft[], dateStr: string): boolean {
  return overrides.some((h) => h.date === dateStr && h.mode === "CLOSED");
}

/**
 * Controlla se il tipo turno è attivo in quella data considerando il festivo.
 * `weekdayUtc` = getUTCDay() per `dateStr`.
 */
export function isShiftActiveOnDate(
  overrides: HolidayOverrideDraft[],
  dateStr: string,
  weekdayUtc: number,
  shiftTypeId: string,
  activeWeekdays: number[],
): boolean {
  const ov = overrides.find((h) => h.date === dateStr);
  if (!ov) return activeWeekdays.includes(weekdayUtc);
  if (ov.mode === "CLOSED") return false;
  if (ov.mode === "SUNDAY_LIKE") return activeWeekdays.includes(0);
  if (ov.mode === "CUSTOM") {
    const set = new Set(ov.shiftTypeIds ?? []);
    return set.has(shiftTypeId);
  }
  return activeWeekdays.includes(weekdayUtc);
}
