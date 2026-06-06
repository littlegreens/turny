/**
 * Giorni straordinari / festivi in `calendar.rules.holidayOverrides`.
 * Allineato a `activeWeekdays` sui tipi turno (0 = dom … 6 = sab, come JS UTC).
 *
 * - `FESTIVO` (periodo): turni attivi quel giorno; solo «Evita festivi» non lavora.
 * - `CLOSED` (calendario): chiusura reale, nessun turno.
 * - `CUSTOM` / `SUNDAY_LIKE`: eccezioni calendario.
 */

export type HolidayOverrideMode = "CLOSED" | "FESTIVO" | "SUNDAY_LIKE" | "CUSTOM";

export type HolidayOverrideDraft = {
  id: string;
  date: string;
  mode: HolidayOverrideMode;
  /** Id tipi turno ammessi quel giorno (festivo o eccezione). */
  shiftTypeIds?: string[];
};

/** Persona che non lavora nei giorni segnati come festivo. */
export const NO_HOLIDAY_WORK_NOTE = "NO_HOLIDAY_WORK";

function newHolidayId(): string {
  if (typeof globalThis.crypto !== "undefined" && "randomUUID" in globalThis.crypto) {
    return globalThis.crypto.randomUUID();
  }
  return `h-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function parseMode(raw: string): HolidayOverrideMode {
  const modeRaw = raw.toUpperCase();
  if (modeRaw === "FESTIVO") return "FESTIVO";
  if (modeRaw === "CLOSED") return "CLOSED";
  if (modeRaw === "CUSTOM") return "CUSTOM";
  return "SUNDAY_LIKE";
}

/** Turni domenicali (fallback festivo senza elenco esplicito). */
export function sundayShiftTypeIds(shiftTypes: Array<{ id: string; activeWeekdays: number[] }>): string[] {
  return shiftTypes.filter((st) => st.activeWeekdays.includes(0)).map((st) => st.id);
}

/** Festivo periodo salvato come CLOSED legacy (con turni) → trattato come FESTIVO. */
export function isFestivoOverride(h: HolidayOverrideDraft, scheduleFestivoDates?: Set<string>): boolean {
  if (h.mode === "FESTIVO") return true;
  if (h.mode === "CLOSED" && (h.shiftTypeIds?.length ?? 0) > 0) return true;
  if (h.mode === "CLOSED" && scheduleFestivoDates?.has(h.date)) return true;
  return false;
}

/** Turni attivi in un festivo / eccezione. */
export function shiftTypeIdsForHolidayOverride(
  h: HolidayOverrideDraft,
  shiftTypes: Array<{ id: string; activeWeekdays: number[] }>,
  scheduleFestivoDates?: Set<string>,
): string[] {
  if (h.shiftTypeIds?.length) return h.shiftTypeIds;
  if (h.mode === "SUNDAY_LIKE") return sundayShiftTypeIds(shiftTypes);
  if (isFestivoOverride(h, scheduleFestivoDates)) return sundayShiftTypeIds(shiftTypes);
  return [];
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
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const mode = parseMode(String(o.mode ?? ""));
    const st = o.shiftTypeIds;
    const shiftTypeIds = Array.isArray(st) ? st.map((x) => String(x)).filter(Boolean) : undefined;
    out.push({
      id: id || newHolidayId(),
      date,
      mode,
      ...(shiftTypeIds?.length ? { shiftTypeIds } : {}),
    });
  }
  return out;
}

/** Giorno festivo lavorativo (flag «Evita festivi»). */
export function isHolidayDate(overrides: HolidayOverrideDraft[], dateStr: string): boolean {
  return overrides.some((h) => h.date === dateStr && isFestivoOverride(h));
}

/** @deprecated Usare `isHolidayDate` o `isShiftActiveOnDate`. */
export function isDateClosedByHoliday(overrides: HolidayOverrideDraft[], dateStr: string): boolean {
  const ov = overrides.find((h) => h.date === dateStr);
  if (!ov) return false;
  if (ov.mode !== "CLOSED") return false;
  return !(ov.shiftTypeIds?.length ?? 0);
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
  if (ov.mode === "SUNDAY_LIKE") return activeWeekdays.includes(0);
  if (ov.mode === "FESTIVO") {
    const set = new Set(ov.shiftTypeIds ?? []);
    if (set.size) return set.has(shiftTypeId);
    return activeWeekdays.includes(0);
  }
  if (ov.mode === "CUSTOM") {
    const set = new Set(ov.shiftTypeIds ?? []);
    return set.has(shiftTypeId);
  }
  if (ov.mode === "CLOSED") {
    const set = new Set(ov.shiftTypeIds ?? []);
    return set.has(shiftTypeId);
  }
  return activeWeekdays.includes(weekdayUtc);
}
