import ExcelJS from "exceljs";
import { isShiftActiveOnDate, type HolidayOverrideDraft } from "./holiday-overrides";

export type ShiftTypeForExcel = {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  color: string;
  order: number;
  activeWeekdays: number[];
};

export type AssignmentForExcel = {
  shiftTypeId: string;
  date: string;
  memberLabel: string;
  memberColor: string | null;
};

export type PersonForExcelSummary = {
  key: string;
  label: string;
  color: string | null;
};

const SLOT_LABELS = ["Mattina", "Mattina", "Turno unico", "Turno unico", "Pomeriggio", "Pomeriggio", "Notte"] as const;

const LABEL_FILL: Record<(typeof SLOT_LABELS)[number], string> = {
  Mattina: "FFDDEBF7",
  "Turno unico": "FFE2EFDA",
  Pomeriggio: "FFFFF2CC",
  Notte: "FF1F3864",
};

const COL_LABEL = 1;
const COL_DAY_START = 2;
const COL_DAY_END = 8;
const COL_SAT = 7;
const COL_SUN = 8;
const COL_SUMMARY_NAME = 10;
const COL_SUMMARY_TURNI = 11;
const COL_SUMMARY_SAB = 12;
const COL_SUMMARY_DOM = 13;
const COL_SUMMARY_NOTTE = 14;

const WEEKDAY_HEADERS = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];

type ShiftCategory = "mattina" | "turnoUnico" | "pomeriggio" | "notte";

type ExcelSlot = {
  rowLabel: (typeof SLOT_LABELS)[number];
  shiftTypeId: string | null;
  /** Indice assegnazione quando più persone sullo stesso tipo turno nella stessa data. */
  personIndex: number;
};

type PreviewDay = { dateStr: string; day: number };

type RowTrack = { row: number; isNight: boolean };

const BODY_FONT_SIZE = 10;
const DAY_HEADER_FONT_SIZE = 11;
const DATA_ROW_HEIGHT = 22;
const DAY_HEADER_BG = "FF525252";

function utcDayOfWeek(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00.000Z`).getUTCDay();
}

function buildCalendarWeekRows(dates: string[]): (PreviewDay | null)[][] {
  const cells: PreviewDay[] = dates.map((dateStr) => {
    const dt = new Date(`${dateStr}T00:00:00.000Z`);
    return { dateStr, day: dt.getUTCDate() };
  });
  const rows: (PreviewDay | null)[][] = [];
  if (cells.length === 0) return rows;
  let row: (PreviewDay | null)[] = [];
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

function colLetter(col: number): string {
  let n = col;
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function cellRef(col: number, row: number): string {
  return `${colLetter(col)}${row}`;
}

/** Quota di bianco nel mix (0.50 ≈ 50% colore persona). */
const PERSON_FILL_WHITE_MIX = 0.50;

function hexToArgb(hex: string, fallback = "FFFFFFFF"): string {
  const h = hex.replace("#", "").trim();
  if (!/^[0-9A-Fa-f]{6}$/.test(h)) return fallback;
  return `FF${h.toUpperCase()}`;
}

/** Schiarisce un #RRGGBB mescolando con bianco (equivalente a bassa opacità su sfondo bianco). */
function lightenHex(hex: string, whiteMix = PERSON_FILL_WHITE_MIX): string | null {
  const h = hex.replace("#", "").trim();
  if (!/^[0-9A-Fa-f]{6}$/.test(h)) return null;
  const w = Math.min(0.92, Math.max(0, whiteMix));
  const ch = (i: number) => parseInt(h.slice(i, i + 2), 16);
  const mix = (c: number) => Math.round(c * (1 - w) + 255 * w);
  const r = mix(ch(0));
  const g = mix(ch(2));
  const b = mix(ch(4));
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function personFillArgb(hex: string, fallback = "FFFFFFFF"): string {
  return hexToArgb(lightenHex(hex) ?? hex, fallback);
}

function thinBorder(): Partial<ExcelJS.Borders> {
  const side: Partial<ExcelJS.Border> = { style: "thin", color: { argb: "FFD1D5DB" } };
  return { top: side, left: side, bottom: side, right: side };
}

/** Nome in griglia e riepilogo (nome e cognome come in Turny). */
export function excelPersonLabel(full: string): string {
  return full.trim().replace(/\s+/g, " ");
}

function classifyShiftType(st: ShiftTypeForExcel): ShiftCategory {
  const n = st.name.toLowerCase();
  if (n.includes("notte")) return "notte";
  if (n.includes("unico") || (st.activeWeekdays.length === 1 && st.activeWeekdays[0] === 0)) return "turnoUnico";
  if (n.includes("pomeriggio")) return "pomeriggio";
  if (n.includes("mattina")) return "mattina";
  const [sh] = st.startTime.split(":").map(Number);
  if (sh >= 18 || sh < 6) return "notte";
  if (sh >= 11) return "pomeriggio";
  return "mattina";
}

function pairCategorySlots(label: "Mattina" | "Turno unico" | "Pomeriggio", types: ShiftTypeForExcel[]): ExcelSlot[] {
  const t0 = types[0]?.id ?? null;
  const t1 = types[1]?.id ?? null;
  if (t0 && t1) {
    return [
      { rowLabel: label, shiftTypeId: t0, personIndex: 0 },
      { rowLabel: label, shiftTypeId: t1, personIndex: 0 },
    ];
  }
  if (t0) {
    return [
      { rowLabel: label, shiftTypeId: t0, personIndex: 0 },
      { rowLabel: label, shiftTypeId: t0, personIndex: 1 },
    ];
  }
  return [
    { rowLabel: label, shiftTypeId: null, personIndex: 0 },
    { rowLabel: label, shiftTypeId: null, personIndex: 0 },
  ];
}

function buildExcelSlots(shiftTypes: ShiftTypeForExcel[]): ExcelSlot[] {
  const groups: Record<ShiftCategory, ShiftTypeForExcel[]> = {
    mattina: [],
    turnoUnico: [],
    pomeriggio: [],
    notte: [],
  };
  const sorted = [...shiftTypes].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  for (const st of sorted) groups[classifyShiftType(st)].push(st);

  const notteId = groups.notte[0]?.id ?? null;
  return [
    ...pairCategorySlots("Mattina", groups.mattina),
    ...pairCategorySlots("Turno unico", groups.turnoUnico),
    ...pairCategorySlots("Pomeriggio", groups.pomeriggio),
    { rowLabel: "Notte", shiftTypeId: notteId, personIndex: 0 },
  ];
}

function buildDates(input: { year: number; month: number; startDate?: string; endDate?: string }): string[] {
  if (input.startDate && input.endDate && input.endDate >= input.startDate) {
    const out: string[] = [];
    const d = new Date(`${input.startDate}T00:00:00.000Z`);
    const end = new Date(`${input.endDate}T00:00:00.000Z`);
    while (d <= end) {
      out.push(d.toISOString().slice(0, 10));
      d.setUTCDate(d.getUTCDate() + 1);
    }
    return out;
  }
  const dim = new Date(input.year, input.month, 0).getDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  return Array.from({ length: dim }, (_, i) => `${input.year}-${pad(input.month)}-${pad(i + 1)}`);
}

function joinCountif(nameRef: string, parts: string[]): string {
  if (parts.length === 0) return "0";
  if (parts.length === 1) return parts[0]!;
  return parts.join("+");
}

function styleCounterCell(cell: ExcelJS.Cell) {
  cell.font = { color: { argb: "FF000000" }, size: 10 };
  cell.alignment = { horizontal: "center", vertical: "middle", wrapText: false };
  cell.border = thinBorder();
}

const PERSON_NAME_FONT: Partial<ExcelJS.Font> = { color: { argb: "FF000000" }, size: BODY_FONT_SIZE };

/** Larghezza colonna Excel stimata dal testo (evita nomi su due righe). */
function excelColWidth(text: string): number {
  return Math.min(44, Math.max(6, text.length * 1.12 + 2));
}

function bumpColWidth(maxByCol: Map<number, number>, col: number, text: string) {
  if (!text) return;
  maxByCol.set(col, Math.max(maxByCol.get(col) ?? 0, excelColWidth(text)));
}

export async function buildScheduleExcelBuffer(input: {
  calendarName: string;
  year: number;
  month: number;
  startDate?: string;
  endDate?: string;
  periodLabel: string;
  shiftTypes: ShiftTypeForExcel[];
  assignments: AssignmentForExcel[];
  summaryPeople: PersonForExcelSummary[];
  holidayOverrides?: HolidayOverrideDraft[];
}): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Turny";
  const ws = wb.addWorksheet("Turni");

  const hol = input.holidayOverrides ?? [];
  const dates = buildDates(input);
  const weekRows = buildCalendarWeekRows(dates);
  const slots = buildExcelSlots(input.shiftTypes);
  const shiftById = new Map(input.shiftTypes.map((st) => [st.id, st]));

  const byCellMulti = new Map<string, AssignmentForExcel[]>();
  for (const a of input.assignments) {
    const key = `${a.date}|${a.shiftTypeId}`;
    const list = byCellMulti.get(key) ?? [];
    list.push(a);
    byCellMulti.set(key, list);
  }

  const summaryHeaders = ["NOME", "TURNI", "SABATI", "DOMENICHE", "NOTTI"];
  const summaryCols = [COL_SUMMARY_NAME, COL_SUMMARY_TURNI, COL_SUMMARY_SAB, COL_SUMMARY_DOM, COL_SUMMARY_NOTTE];
  summaryCols.forEach((col, i) => {
    const c = ws.getCell(1, col);
    c.value = summaryHeaders[i];
    c.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2F4F4F" } };
    c.alignment = { horizontal: "center", vertical: "middle" };
    c.border = thinBorder();
  });

  const dataRowTracks: RowTrack[] = [];
  const colMaxWidth = new Map<number, number>();
  let currentRow = 2;

  for (const week of weekRows) {
    ws.getRow(currentRow).height = DATA_ROW_HEIGHT;

    for (let di = 0; di < 7; di++) {
      const col = COL_DAY_START + di;
      const day = week[di];
      const c = ws.getCell(currentRow, col);
      const header = WEEKDAY_HEADERS[di];
      const isSun = di === 6;

      if (!day) {
        c.value = header;
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } };
        c.font = { color: { argb: "FF6B7280" }, size: BODY_FONT_SIZE };
      } else {
        const headerText = `${header} ${day.day}`;
        c.value = headerText;
        bumpColWidth(colMaxWidth, col, headerText);
        c.font = {
          color: { argb: "FFFFFFFF" },
          size: DAY_HEADER_FONT_SIZE,
        };
        c.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: isSun ? "FFFF0000" : DAY_HEADER_BG },
        };
      }
      c.alignment = { horizontal: "center", vertical: "middle", wrapText: false };
      c.border = thinBorder();
    }
    ws.getCell(currentRow, COL_LABEL).border = thinBorder();

    const dataStartRow = currentRow + 1;

    for (let si = 0; si < slots.length; si++) {
      const slot = slots[si]!;
      const row = dataStartRow + si;
      const st = slot.shiftTypeId ? shiftById.get(slot.shiftTypeId) : undefined;
      const isNight = slot.rowLabel === "Notte";

      dataRowTracks.push({ row, isNight });

      const labelCell = ws.getCell(row, COL_LABEL);
      labelCell.value = slot.rowLabel;
      labelCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: LABEL_FILL[slot.rowLabel] },
      };
      labelCell.font = {
        bold: true,
        color: { argb: isNight ? "FFFFFFFF" : "FF000000" },
        size: BODY_FONT_SIZE,
      };
      labelCell.alignment = { vertical: "middle", horizontal: "left" };
      labelCell.border = thinBorder();
      ws.getRow(row).height = DATA_ROW_HEIGHT;

      for (let di = 0; di < 7; di++) {
        const col = COL_DAY_START + di;
        const day = week[di];
        const c = ws.getCell(row, col);
        c.border = thinBorder();
        c.alignment = { horizontal: "center", vertical: "middle", wrapText: false };

        if (!day || !st) {
          c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } };
          continue;
        }

        const dow = utcDayOfWeek(day.dateStr);
        const active = isShiftActiveOnDate(hol, day.dateStr, dow, st.id, st.activeWeekdays);
        if (!active) {
          c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } };
          continue;
        }

        if (slot.rowLabel === "Turno unico" && dow !== 0) {
          c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } };
          continue;
        }

        const list = byCellMulti.get(`${day.dateStr}|${st.id}`) ?? [];
        const assignment = list[slot.personIndex];
        if (assignment) {
          const personName = excelPersonLabel(assignment.memberLabel);
          c.value = personName;
          c.font = PERSON_NAME_FONT;
          bumpColWidth(colMaxWidth, col, personName);
          const bg = assignment.memberColor ?? st.color;
          c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: personFillArgb(bg) } };
        } else {
          c.font = { color: { argb: "FF000000" }, size: BODY_FONT_SIZE };
          c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } };
        }
      }
    }

    currentRow = dataStartRow + slots.length + 1;
  }

  const summaryStartRow = 2;

  input.summaryPeople.forEach((person, idx) => {
    const row = summaryStartRow + idx;
    const excelLabel = excelPersonLabel(person.label);
    const nameCell = ws.getCell(row, COL_SUMMARY_NAME);
    nameCell.value = excelLabel;
    nameCell.font = PERSON_NAME_FONT;
    bumpColWidth(colMaxWidth, COL_SUMMARY_NAME, excelLabel);
    if (person.color) {
      nameCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: personFillArgb(person.color) } };
    }
    nameCell.border = thinBorder();
    nameCell.alignment = { vertical: "middle", horizontal: "left", wrapText: false };

    const nameRef = `$${colLetter(COL_SUMMARY_NAME)}$${row}`;
    const turniParts = dataRowTracks.map(
      (t) => `COUNTIF(${cellRef(COL_DAY_START, t.row)}:${cellRef(COL_DAY_END, t.row)},${nameRef})`,
    );
    const sabParts = dataRowTracks.map((t) => `COUNTIF(${cellRef(COL_SAT, t.row)},${nameRef})`);
    const domParts = dataRowTracks.map((t) => `COUNTIF(${cellRef(COL_SUN, t.row)},${nameRef})`);
    const nightParts = dataRowTracks
      .filter((t) => t.isNight)
      .map((t) => `COUNTIF(${cellRef(COL_DAY_START, t.row)}:${cellRef(COL_DAY_END, t.row)},${nameRef})`);

    const turniCell = ws.getCell(row, COL_SUMMARY_TURNI);
    turniCell.value = { formula: joinCountif(nameRef, turniParts) };
    styleCounterCell(turniCell);

    const sabCell = ws.getCell(row, COL_SUMMARY_SAB);
    sabCell.value = { formula: joinCountif(nameRef, sabParts) };
    styleCounterCell(sabCell);

    const domCell = ws.getCell(row, COL_SUMMARY_DOM);
    domCell.value = { formula: joinCountif(nameRef, domParts) };
    styleCounterCell(domCell);

    const notteCell = ws.getCell(row, COL_SUMMARY_NOTTE);
    notteCell.value = { formula: nightParts.length ? joinCountif(nameRef, nightParts) : "0" };
    styleCounterCell(notteCell);
  });

  const minColWidth: Record<number, number> = {
    [COL_LABEL]: 12,
    [COL_SUMMARY_NAME]: 14,
    [COL_SUMMARY_TURNI]: 7,
    [COL_SUMMARY_SAB]: 7,
    [COL_SUMMARY_DOM]: 9,
    [COL_SUMMARY_NOTTE]: 7,
  };
  for (let c = 1; c <= COL_SUMMARY_NOTTE; c++) {
    if (c === 9) {
      ws.getColumn(c).width = 1;
      continue;
    }
    const min = minColWidth[c] ?? 8;
    const computed = colMaxWidth.get(c) ?? min;
    ws.getColumn(c).width = Math.max(min, computed);
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
