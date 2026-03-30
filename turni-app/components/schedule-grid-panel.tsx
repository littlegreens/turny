"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { type DragEvent, useEffect, useMemo, useRef, useState } from "react";
import { ConfirmModal } from "@/components/confirm-modal";
import { useBeforeUnloadWhen } from "@/hooks/use-unsaved-prompt";
import { ColorPalettePicker } from "@/components/color-palette-picker";
import { DateMultiPicker } from "@/components/date-multi-picker";
import { InfeasibleGenerateModal } from "@/components/infeasible-generate-modal";
import { ScheduleReportCsvButton } from "@/components/schedule-report-csv-button";
import type { InfeasibilityHints } from "@/lib/infeasibility-hints";
import type { CoverageAlert, MemberReportRow } from "@/lib/schedule-report";

type ShiftTypeCol = {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  color: string;
  minStaff: number;
  maxStaff: number | null;
  activeWeekdays: number[];
};

type MemberOpt = {
  id: string;
  userId?: string;
  label: string;
  professionalRole?: string;
  contractShiftsWeek: number | null;
  contractShiftsMonth: number | null;
  configMaxNights: number | null;
  configMaxSaturdays: number | null;
  configMaxSundays: number | null;
  baseUnavailableWeekdays: number[];
  baseUnavailableShiftTypeIds: string[];
  memberColor: string | null;
  /** Solo override calendario (#hex); se null → griglia usa org/resolve. */
  calendarColorOverride: string | null;
};

export type GridAssignment = {
  id: string;
  memberId: string;
  shiftTypeId: string;
  date: string;
  memberLabel: string;
  shiftTypeName: string;
  shiftTypeColor: string;
};

type Unavail = {
  id: string;
  memberId: string;
  date: string;
  type: "UNAVAILABLE_DATE" | "UNAVAILABLE_SHIFT" | "REQUIRED_DATE" | "REQUIRED_SHIFT";
  shiftTypeId: string | null;
};

type Props = {
  scheduleId: string;
  calId: string;
  /** Per redirect dopo archiviazione / ripristino */
  orgSlug: string;
  scheduleStatus: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  /** OWNER / ADMIN / MANAGER: mostra Archivia, Ripristina, Visualizza anche se non in bozza */
  canManageSchedule: boolean;
  calendarName?: string;
  periodLabel?: string;
  /** Tipo di periodo del turno aperto (come definito per quel calendario). */
  schedulePeriodType?: "MONTHLY" | "WEEKLY" | "CUSTOM";
  initialPreviewOpen?: boolean;
  currentUserId?: string;
  year: number;
  month: number;
  startDate?: string;
  endDate?: string;
  canEdit: boolean;
  scheduleRules?: unknown;
  shiftTypes: ShiftTypeCol[];
  members: MemberOpt[];
  assignments: GridAssignment[];
  monthlyUnavailable: Unavail[];
  reportSummary: {
    memberRows: MemberReportRow[];
    coverageAlerts: CoverageAlert[];
    totals: { assignments: number; hours: number; shiftSlotsChecked: number };
  };
  reportCsvFilename: string;
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

/** Allineato a `activeWeekdays` su Calendar/ShiftType (0 = dom, 1 = lun, …). */
function utcDayOfWeek(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00.000Z`).getUTCDay();
}

function addUtcDaysIso(dateStr: string, delta: number): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** Sabato e domenica consecutivi entrambi nel periodo e senza turno → 1 WE libero. */
function countFreeFullWeekends(dates: string[], worked: Set<string>): number {
  const dateSet = new Set(dates);
  let n = 0;
  for (const dateStr of dates) {
    if (utcDayOfWeek(dateStr) !== 6) continue;
    const sun = addUtcDaysIso(dateStr, 1);
    if (!dateSet.has(sun)) continue;
    if (worked.has(dateStr) || worked.has(sun)) continue;
    n++;
  }
  return n;
}

function weekdayLabel(weekday: number): string {
  const map: Record<number, string> = { 0: "Dom", 1: "Lun", 2: "Mar", 3: "Mer", 4: "Gio", 5: "Ven", 6: "Sab" };
  return map[weekday] ?? String(weekday);
}

function formatDateIt(isoDate: string) {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  return new Intl.DateTimeFormat("it-IT").format(d);
}

function formatReportCellDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("it-IT", { weekday: "short", day: "2-digit", month: "2-digit" });
}

function memberShiftTargetsLine(m: MemberOpt | undefined): string {
  if (!m) return "nessuno";
  const parts: string[] = [];
  if (m.contractShiftsMonth != null) parts.push(`fino a ${m.contractShiftsMonth} turni nel periodo`);
  if (m.contractShiftsWeek != null) parts.push(`fino a ${m.contractShiftsWeek} turni nella settimana`);
  return parts.length ? parts.join(" · ") : "nessuno";
}

function serializeMemberPopupState(
  useOrgColor: boolean,
  color: string,
  dayOff: Record<string, boolean>,
  shiftOff: Record<string, boolean>,
  dayMust: Record<string, boolean>,
  shiftMust: Record<string, boolean>,
  dateStrs: string[],
  sts: ShiftTypeCol[],
) {
  const parts: string[] = [useOrgColor ? "ORG1" : `HEX:${color}`];
  for (const d of dateStrs) parts.push(`d:${d}:${dayOff[d] ? 1 : 0}:${dayMust[d] ? 1 : 0}`);
  for (const d of dateStrs)
    for (const st of sts) {
      const k = `${d}|${st.id}`;
      parts.push(`s:${k}:${shiftOff[k] ? 1 : 0}:${shiftMust[k] ? 1 : 0}`);
    }
  return parts.join("\n");
}

export function ScheduleGridPanel({
  scheduleId,
  orgSlug,
  calId,
  scheduleStatus,
  canManageSchedule,
  calendarName,
  periodLabel,
  schedulePeriodType = "MONTHLY",
  initialPreviewOpen = false,
  currentUserId,
  year,
  month,
  startDate,
  endDate,
  canEdit,
  scheduleRules,
  shiftTypes,
  members,
  assignments,
  monthlyUnavailable,
  reportSummary,
  reportCsvFilename,
}: Props) {
  const router = useRouter();
  const canEditRules = canEdit && scheduleStatus === "DRAFT";
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [clearOpen, setClearOpen] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(members[0]?.id ?? null);
  const [memberPopupOpen, setMemberPopupOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(initialPreviewOpen);
  const [dragMemberId, setDragMemberId] = useState<string | null>(null);
  const [memberColorDraft, setMemberColorDraft] = useState<string>("#3B8BD4");
  const [memberDayOff, setMemberDayOff] = useState<Record<string, boolean>>({});
  const [memberShiftOff, setMemberShiftOff] = useState<Record<string, boolean>>({});
  const [memberDayMust, setMemberDayMust] = useState<Record<string, boolean>>({});
  const [memberShiftMust, setMemberShiftMust] = useState<Record<string, boolean>>({});
  const [memberBaseDayOff, setMemberBaseDayOff] = useState<Record<string, boolean>>({});
  const [memberBaseShiftOff, setMemberBaseShiftOff] = useState<Record<string, boolean>>({});
  const [hoverCellKey, setHoverCellKey] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  /** Riepilogo, KPI, copertura e alert griglia solo su richiesta (evita liste enormi a calendario vuoto). */
  const [reportPanelOpen, setReportPanelOpen] = useState(false);
  type RuleDraft = {
    id: string;
    name: string;
    kind: "ALWAYS_WITH" | "NEVER_WITH";
    ifSelectors: string[];
    thenSelectors: string[];
    dates?: string[];
  };
  const [rulesDraft, setRulesDraft] = useState<RuleDraft[]>([]);
  const [ruleModalOpen, setRuleModalOpen] = useState(false);
  const [ruleModalError, setRuleModalError] = useState<string | null>(null);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [deleteRuleTargetId, setDeleteRuleTargetId] = useState<string | null>(null);
  const [ruleName, setRuleName] = useState("");
  const [ruleKind, setRuleKind] = useState<"ALWAYS_WITH" | "NEVER_WITH">("ALWAYS_WITH");
  const [ruleIfSelectors, setRuleIfSelectors] = useState<string[]>([]);
  const [ruleThenSelectors, setRuleThenSelectors] = useState<string[]>([]);
  const [ruleDates, setRuleDates] = useState<string[]>([]);
  const [ifQuery, setIfQuery] = useState("");
  const [thenQuery, setThenQuery] = useState("");
  const [infeasibleModal, setInfeasibleModal] = useState<{
    open: boolean;
    message: string;
    hints: InfeasibilityHints | null;
  }>({ open: false, message: "", hints: null });
  const [viewMode, setViewMode] = useState<"standard" | "calendar" | "mine">("standard");
  const memberPopupBaselineRef = useRef<string>("");
  const [memberDiscardConfirmOpen, setMemberDiscardConfirmOpen] = useState(false);
  const [memberResetConfirmOpen, setMemberResetConfirmOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [memberUseOrgColor, setMemberUseOrgColor] = useState(false);

  useEffect(() => {
    if (!info) return;
    const timer = setTimeout(() => setInfo(null), 2800);
    return () => clearTimeout(timer);
  }, [info]);

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 4200);
    return () => clearTimeout(timer);
  }, [error]);

  useEffect(() => {
    const raw = (scheduleRules ?? {}) as { coPresenceRules?: unknown };
    const list = Array.isArray(raw.coPresenceRules) ? raw.coPresenceRules : [];
    const normalized = list
      .filter((r): r is Record<string, unknown> => Boolean(r && typeof r === "object"))
      .map((r) => ({
        id: String(r.id || crypto.randomUUID()),
        name: String(r.name || "Regola"),
        kind: r.kind === "NEVER_WITH" ? ("NEVER_WITH" as const) : ("ALWAYS_WITH" as const),
        ifSelectors: Array.isArray(r.ifSelectors)
          ? r.ifSelectors.map(String).filter(Boolean)
          : Array.isArray(r.ifMemberIds)
            ? r.ifMemberIds.map((id) => `MEMBER:${String(id)}`).filter(Boolean)
            : [],
        thenSelectors: Array.isArray(r.thenSelectors)
          ? r.thenSelectors.map(String).filter(Boolean)
          : Array.isArray(r.thenMemberIds)
            ? r.thenMemberIds.map((id) => `MEMBER:${String(id)}`).filter(Boolean)
            : [],
        dates: Array.isArray(r.dates) ? r.dates.map(String).filter(Boolean) : undefined,
      }))
      .filter((r) => r.ifSelectors.length && r.thenSelectors.length);
    setRulesDraft(normalized);
  }, [scheduleRules]);

  const roleOptions = useMemo(() => {
    const set = new Set<string>();
    for (const m of members) {
      const r = String(m.professionalRole ?? "").trim();
      if (r) set.add(r);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [members]);

  const selectorOptions = useMemo(() => {
    const out: Array<{ key: string; label: string; kind: "ROLE" | "MEMBER"; color?: string | null }> = [];
    for (const r of roleOptions) out.push({ key: `ROLE:${r}`, label: `Ruolo: ${r}`, kind: "ROLE" });
    for (const m of members) out.push({ key: `MEMBER:${m.id}`, label: m.label, kind: "MEMBER", color: m.memberColor });
    return out;
  }, [members, roleOptions]);

  function selectorLabel(sel: string): string {
    if (sel.startsWith("ROLE:")) return `Ruolo: ${sel.slice("ROLE:".length)}`;
    if (sel.startsWith("MEMBER:")) {
      const id = sel.slice("MEMBER:".length);
      return members.find((m) => m.id === id)?.label ?? `Persona: ${id}`;
    }
    return sel;
  }

  function selectorColor(sel: string): string | null {
    if (!sel.startsWith("MEMBER:")) return null;
    const id = sel.slice("MEMBER:".length);
    return members.find((m) => m.id === id)?.memberColor ?? null;
  }

  function openRuleModal(ruleId: string | null) {
    setRuleModalError(null);
    if (!ruleId) {
      setEditingRuleId(null);
      setRuleName("");
      setRuleKind("ALWAYS_WITH");
      setRuleIfSelectors([]);
      setRuleThenSelectors([]);
      setRuleDates([]);
      setIfQuery("");
      setThenQuery("");
      setRuleModalOpen(true);
      return;
    }
    const r = rulesDraft.find((x) => x.id === ruleId);
    if (!r) return;
    setEditingRuleId(r.id);
    setRuleName(r.name);
    setRuleKind(r.kind);
    setRuleIfSelectors(r.ifSelectors);
    setRuleThenSelectors(r.thenSelectors);
    setRuleDates(r.dates ?? []);
    setIfQuery("");
    setThenQuery("");
    setRuleModalOpen(true);
  }

  async function saveAllRules(nextRules: RuleDraft[], fromModal = false) {
    if (!canEditRules) {
      const msg = "Le regole turno si possono modificare solo quando il turno è in bozza.";
      if (fromModal) setRuleModalError(msg); else setError(msg);
      return false;
    }
    setLoadingKey("rules");
    if (fromModal) setRuleModalError(null); else setError(null);
    try {
      const cleaned = nextRules
        .map((r) => ({
          id: r.id,
          name: r.name.trim(),
          kind: r.kind,
          ifSelectors: [...new Set(r.ifSelectors)].filter(Boolean),
          thenSelectors: [...new Set(r.thenSelectors)].filter(Boolean),
          dates: r.dates && r.dates.length ? [...new Set(r.dates)].filter(Boolean).sort() : undefined,
        }))
        .filter((r) => r.name.length >= 2 && r.ifSelectors.length && r.thenSelectors.length);
      const res = await fetch(`/api/schedules/${scheduleId}/rules`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coPresenceRules: cleaned }),
      });
      const rawText = await res.text().catch(() => "");
      let payload: { error?: string } = {};
      try { payload = JSON.parse(rawText) as { error?: string }; } catch { /* not json */ }
      if (!res.ok) {
        const msg = payload.error ?? `Errore ${res.status}: ${rawText.slice(0, 200) || "risposta non valida"}`;
        if (fromModal) setRuleModalError(msg); else setError(msg);
        return false;
      }
      setRulesDraft(cleaned);
      setInfo("Regole salvate.");
      router.refresh();
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (fromModal) setRuleModalError(msg); else setError(msg);
      return false;
    } finally {
      setLoadingKey(null);
    }
  }

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

  const unavailSet = useMemo(() => {
    const s = new Set<string>();
    for (const u of monthlyUnavailable) {
      if (u.date && u.type === "UNAVAILABLE_DATE") s.add(`${u.memberId}|${u.date}`);
    }
    return s;
  }, [monthlyUnavailable]);

  const unavailShiftSet = useMemo(() => {
    const s = new Set<string>();
    for (const u of monthlyUnavailable) {
      if (u.date && u.type === "UNAVAILABLE_SHIFT" && u.shiftTypeId) {
        s.add(`${u.memberId}|${u.date}|${u.shiftTypeId}`);
      }
    }
    return s;
  }, [monthlyUnavailable]);

  const unavailByMemberDate = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of monthlyUnavailable) {
      if (u.type !== "UNAVAILABLE_DATE") continue;
      if (!u.date) continue;
      m.set(`${u.memberId}|${u.date}`, u.id);
    }
    return m;
  }, [monthlyUnavailable]);

  const requiredDateSet = useMemo(() => {
    const s = new Set<string>();
    for (const u of monthlyUnavailable) {
      if (u.type === "REQUIRED_DATE" && u.date) s.add(`${u.memberId}|${u.date}`);
    }
    return s;
  }, [monthlyUnavailable]);

  /** Almeno due REQUIRED_SHIFT (obbligo turno) per stesso membro e data: il solver consente più turni quel giorno. */
  const multiRequiredShiftDaySet = useMemo(() => {
    const counts = new Map<string, number>();
    for (const u of monthlyUnavailable) {
      if (u.type !== "REQUIRED_SHIFT" || !u.date) continue;
      const k = `${u.memberId}|${u.date}`;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    const s = new Set<string>();
    for (const [k, n] of counts) {
      if (n >= 2) s.add(k);
    }
    return s;
  }, [monthlyUnavailable]);

  const overlapByMemberDate = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of assignments) {
      const k = `${a.memberId}|${a.date}`;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return counts;
  }, [assignments]);

  const byCell = useMemo(() => {
    const m = new Map<string, GridAssignment[]>();
    for (const a of assignments) {
      const k = `${a.date}|${a.shiftTypeId}`;
      const list = m.get(k) ?? [];
      list.push(a);
      m.set(k, list);
    }
    return m;
  }, [assignments]);

  const countByCell = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of assignments) {
      const k = `${a.date}|${a.shiftTypeId}`;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [assignments]);

  const riepilogoPerPersona = useMemo(() => {
    return reportSummary.memberRows.map((r) => {
      const worked = new Set(assignments.filter((a) => a.memberId === r.memberId).map((a) => a.date));
      let freeDays = 0;
      for (const dateStr of dates) {
        if (!worked.has(dateStr)) freeDays++;
      }
      const freeWeekend = countFreeFullWeekends(dates, worked);
      return { ...r, freeDays, freeWeekend };
    });
  }, [reportSummary.memberRows, assignments, dates]);

  const alerts = useMemo(() => {
    const rows: { level: "ERROR" | "WARNING"; text: string; memberId?: string }[] = [];
    const seen = new Set<string>();

    for (const mdKey of multiRequiredShiftDaySet) {
      const pipe = mdKey.indexOf("|");
      if (pipe < 0) continue;
      const memId = mdKey.slice(0, pipe);
      const dateStr = mdKey.slice(pipe + 1);
      const k = `MULTIREQ|${mdKey}`;
      if (seen.has(k)) continue;
      seen.add(k);
      const label = members.find((m) => m.id === memId)?.label ?? "?";
      rows.push({
        level: "WARNING",
        text: `${label}: più obblighi turno lo stesso giorno (${formatDateIt(dateStr)}). Il generatore ammette più turni quel giorno solo in questo caso (eccezione al limite di un turno/giorno).`,
        memberId: memId,
      });
    }

    for (const a of assignments) {
      const kMemberDate = `${a.memberId}|${a.date}`;
      if ((overlapByMemberDate.get(kMemberDate) ?? 0) > 1) {
        if (multiRequiredShiftDaySet.has(kMemberDate)) continue;
        const k = `DOUBLE|${kMemberDate}`;
        if (!seen.has(k)) {
          seen.add(k);
          rows.push({
            level: "WARNING",
            text: `${a.memberLabel}: doppio turno nello stesso giorno (${a.date})`,
            memberId: a.memberId,
          });
        }
      }
      if (unavailSet.has(kMemberDate)) {
        const k = `UNAVAILABLE|${a.id}`;
        if (!seen.has(k)) {
          seen.add(k);
          rows.push({
            level: "ERROR",
            text: `${a.memberLabel}: assegnato nonostante indisponibilita mensile (${a.date}, ${a.shiftTypeName})`,
            memberId: a.memberId,
          });
        }
      }
    }

    const byMember = new Map<string, GridAssignment[]>();
    for (const a of assignments) {
      const list = byMember.get(a.memberId) ?? [];
      list.push(a);
      byMember.set(a.memberId, list);
    }
    for (const [memberId, list] of byMember) {
      const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date));
      for (let i = 0; i < sorted.length; i++) {
        const current = sorted[i];
        const st = shiftTypes.find((x) => x.id === current.shiftTypeId);
        if (!st) continue;
        const isNight = st.name.toLowerCase().includes("notte") || st.endTime <= st.startTime;
        if (!isNight) continue;
        const nextDate = new Date(`${current.date}T00:00:00.000Z`);
        nextDate.setUTCDate(nextDate.getUTCDate() + 1);
        const nextIso = nextDate.toISOString().slice(0, 10);
        const hasNextDayShift = sorted.some((x) => x.date === nextIso);
        if (hasNextDayShift) {
          rows.push({
            level: "ERROR",
            text: `${current.memberLabel}: dopo turno notturno deve risultare riposo il giorno ${nextIso}`,
            memberId,
          });
        }
      }
    }

    for (const d of days) {
      const dateStr = d.dateStr;
      for (const st of shiftTypes) {
        if (!st.activeWeekdays.includes(utcDayOfWeek(dateStr))) continue;
        const assigned = countByCell.get(`${dateStr}|${st.id}`) ?? 0;
        if (assigned < st.minStaff) {
          rows.push({
            level: "ERROR",
            text: `${dateStr} ${st.name}: copertura insufficiente (${assigned}/${st.minStaff})`,
          });
        }
      }
    }

    for (const mem of members) {
      if (mem.contractShiftsMonth == null) continue;
      const cap = mem.contractShiftsMonth;
      const cnt = assignments.filter((a) => a.memberId === mem.id).length;
      if (cnt > cap) {
        rows.push({
          level: "ERROR",
          text: `${mem.label}: ${cnt} turni nel periodo, superiore al tetto contrattuale mensile (${cap}).`,
          memberId: mem.id,
        });
      }
    }

    const seenReq = new Set<string>();
    for (const mem of members) {
      for (const d of days) {
        const rk = `${mem.id}|${d.dateStr}`;
        if (!requiredDateSet.has(rk)) continue;
        const worked = assignments.some((a) => a.memberId === mem.id && a.date === d.dateStr);
        if (!worked) {
          const k = `RD|${rk}`;
          if (!seenReq.has(k)) {
            seenReq.add(k);
            rows.push({
              level: "ERROR",
              text: `${mem.label}: DEVE avere almeno un turno il ${formatDateIt(d.dateStr)} (vincolo periodo).`,
              memberId: mem.id,
            });
          }
        }
      }
    }

    for (const u of monthlyUnavailable) {
      if (u.type !== "REQUIRED_SHIFT" || !u.shiftTypeId || !u.date) continue;
      const has = assignments.some(
        (a) => a.memberId === u.memberId && a.date === u.date && a.shiftTypeId === u.shiftTypeId,
      );
      if (has) continue;
      const mem = members.find((m) => m.id === u.memberId);
      const st = shiftTypes.find((s) => s.id === u.shiftTypeId);
      const k = `RS|${u.memberId}|${u.date}|${u.shiftTypeId}`;
      if (seenReq.has(k)) continue;
      seenReq.add(k);
      rows.push({
        level: "ERROR",
        text: `${mem?.label ?? "?"}: DEVE il turno «${st?.name ?? "?"}» il ${formatDateIt(u.date)} (vincolo periodo).`,
        memberId: u.memberId,
      });
    }

    return rows;
  }, [
    assignments,
    countByCell,
    days,
    members,
    multiRequiredShiftDaySet,
    overlapByMemberDate,
    requiredDateSet,
    shiftTypes,
    unavailSet,
    monthlyUnavailable,
  ]);

  const memberById = useMemo(() => {
    const m = new Map<string, MemberOpt>();
    for (const x of members) m.set(x.id, x);
    return m;
  }, [members]);

  const myMember = useMemo(
    () => (currentUserId ? members.find((m) => m.userId === currentUserId) ?? null : null),
    [currentUserId, members],
  );

  const myAssignments = useMemo(() => {
    if (!myMember) return [] as GridAssignment[];
    return assignments
      .filter((a) => a.memberId === myMember.id)
      .sort((a, b) => `${a.date}|${a.shiftTypeName}`.localeCompare(`${b.date}|${b.shiftTypeName}`));
  }, [assignments, myMember]);

  const memberPopupDirty = useMemo(() => {
    if (!memberPopupOpen || !selectedMemberId) return false;
    const cur = serializeMemberPopupState(
      memberUseOrgColor,
      memberColorDraft,
      memberDayOff,
      memberShiftOff,
      memberDayMust,
      memberShiftMust,
      dates,
      shiftTypes,
    );
    return cur !== memberPopupBaselineRef.current;
  }, [
    memberPopupOpen,
    selectedMemberId,
    memberUseOrgColor,
    memberColorDraft,
    memberDayOff,
    memberShiftOff,
    memberDayMust,
    memberShiftMust,
    dates,
    shiftTypes,
  ]);

  useBeforeUnloadWhen(memberPopupDirty);

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

  function downloadMyIcs() {
    if (!myMember) return;
    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Turny//MyShifts//IT"];
    for (const a of myAssignments) {
      const st = shiftTypes.find((s) => s.id === a.shiftTypeId);
      if (!st) continue;
      const start = `${a.date.replaceAll("-", "")}T${st.startTime.replace(":", "")}00`;
      const end = `${a.date.replaceAll("-", "")}T${st.endTime.replace(":", "")}00`;
      lines.push("BEGIN:VEVENT");
      lines.push(`UID:${a.id}@turny`);
      lines.push(`DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`);
      lines.push(`DTSTART:${start}`);
      lines.push(`DTEND:${end}`);
      lines.push(`SUMMARY:Turno - ${st.name}`);
      lines.push(`DESCRIPTION:${myMember.label}`);
      lines.push("END:VEVENT");
    }
    lines.push("END:VCALENDAR");
    const blob = new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `turni-${myMember.label.replaceAll(" ", "-").toLowerCase()}.ics`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function addAssignment(date: string, shiftTypeId: string, memberId: string) {
    if (!canEdit || !memberId) return;
    setLoadingKey(`${date}|${shiftTypeId}|add`);
    setError(null);
    const res = await fetch(`/api/schedules/${scheduleId}/assignments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, shiftTypeId, memberId }),
    });
    const payload = (await res.json()) as { error?: string };
    setLoadingKey(null);
    if (!res.ok) {
      setError(payload.error ?? "Errore salvataggio");
      return;
    }
    router.refresh();
  }

  async function removeAssignment(id: string) {
    setLoadingKey(`${id}|del`);
    setError(null);
    const res = await fetch(`/api/shift-assignments/${id}`, { method: "DELETE" });
    const payload = (await res.json()) as { error?: string };
    setLoadingKey(null);
    setDeleteId(null);
    if (!res.ok) {
      setError(payload.error ?? "Errore eliminazione");
      return;
    }
    router.refresh();
  }

  async function archiveSchedule() {
    if (!canManageSchedule) return;
    setLoadingKey("archive");
    setError(null);
    const res = await fetch(`/api/schedules/${scheduleId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "ARCHIVED" }),
    });
    setLoadingKey(null);
    setArchiveOpen(false);
    if (!res.ok) {
      setError("Archiviazione non riuscita");
      return;
    }
    router.push(`/${orgSlug}/turni`);
    router.refresh();
  }

  async function restoreSchedule() {
    if (!canManageSchedule) return;
    setLoadingKey("restore");
    setError(null);
    const res = await fetch(`/api/schedules/${scheduleId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "PUBLISHED" }),
    });
    setLoadingKey(null);
    setRestoreOpen(false);
    if (!res.ok) {
      setError("Ripristino non riuscito");
      return;
    }
    router.push(`/${orgSlug}/turni`);
    router.refresh();
  }

  async function generateAuto() {
    if (!canEdit) return;
    setLoadingKey("generate");
    setError(null);
    setInfo(null);
    try {
      const res = await fetch(`/api/schedules/${scheduleId}/generate`, {
        method: "POST",
        signal: AbortSignal.timeout(120_000),
      });
      let payload: {
        error?: string;
        created?: number;
        alerts?: { type: string; message?: string }[];
        impossible?: boolean;
        schedulerStatus?: string;
        hints?: InfeasibilityHints;
      } = {};
      try {
        payload = (await res.json()) as typeof payload;
      } catch {
        setError(res.ok ? "Risposta generazione non valida." : `Errore HTTP ${res.status}`);
        return;
      }
      if (!res.ok) {
        const impossible = Boolean(payload.impossible || payload.schedulerStatus === "INFEASIBLE");
        if (impossible) {
          setError(null);
          setInfeasibleModal({
            open: true,
            message:
              payload.error ??
              "Nessuna soluzione possibile con i vincoli attuali (copertura, indisponibilità, massimali, riposi).",
            hints: payload.hints ?? null,
          });
          return;
        }
        setError(
          payload.error ??
            (res.status === 504
              ? "Timeout: la generazione ha impiegato troppo tempo. Verifica il servizio Python (uvicorn) e riprova."
              : "Errore generazione automatica"),
        );
        return;
      }
      const created = payload.created ?? 0;
      setInfo(`Generazione completata: ${created} assegnazioni create e salvate automaticamente.`);
      router.refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("abort") || msg.includes("AbortError") || msg.includes("The operation was aborted")) {
        setError(
          "Timeout generazione (oltre 2 minuti). Controlla che uvicorn su turny-scheduler sia avviato e che SCHEDULER_SERVICE_URL sia corretto in .env.",
        );
      } else {
        setError(msg || "Generazione non riuscita.");
      }
    } finally {
      setLoadingKey(null);
    }
  }

  async function clearAllAssignments() {
    setLoadingKey("clear");
    setError(null);
    const res = await fetch(`/api/schedules/${scheduleId}/assignments`, { method: "DELETE" });
    const payload = (await res.json()) as { error?: string };
    setLoadingKey(null);
    setClearOpen(false);
    if (!res.ok) {
      setError(payload.error ?? "Errore svuotamento");
      return;
    }
    setReportPanelOpen(false);
    setInfo("Turno svuotato.");
    router.refresh();
  }

  async function saveAll() {
    setLoadingKey("sync");
    setError(null);
    await router.refresh();
    setLoadingKey(null);
    setInfo("Salvato.");
  }

  async function publishSchedule() {
    if (!canManageSchedule || scheduleStatus !== "DRAFT") return;
    setLoadingKey("publish");
    setError(null);
    const res = await fetch(`/api/schedules/${scheduleId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "PUBLISHED" }),
    });
    setLoadingKey(null);
    setPublishOpen(false);
    if (!res.ok) {
      setError("Pubblicazione non riuscita");
      return;
    }
    router.refresh();
  }

  function closeMemberPopup(force: boolean) {
    if (!force && memberPopupDirty) {
      setMemberDiscardConfirmOpen(true);
      return;
    }
    setMemberPopupOpen(false);
    setMemberDiscardConfirmOpen(false);
  }

  function openMemberPopup(memberId: string) {
    setSelectedMemberId(memberId);
    const member = memberById.get(memberId);
    const overrideRaw = member?.calendarColorOverride;
    const hasCalendarOverride = Boolean(overrideRaw && /^#[0-9A-Fa-f]{6}$/.test(overrideRaw));
    setMemberUseOrgColor(!hasCalendarOverride);
    const colorInit =
      hasCalendarOverride && overrideRaw
        ? overrideRaw
        : member?.memberColor && /^#[0-9A-Fa-f]{6}$/.test(member.memberColor)
          ? member.memberColor
          : "#3B8BD4";
    const dayOff: Record<string, boolean> = {};
    const shiftOff: Record<string, boolean> = {};
    const dayMust: Record<string, boolean> = {};
    const shiftMust: Record<string, boolean> = {};
    const baseDayOff: Record<string, boolean> = {};
    const baseShiftOff: Record<string, boolean> = {};
    for (const d of days) {
      const dow = utcDayOfWeek(d.dateStr);
      const hasBaseDay = Boolean(member?.baseUnavailableWeekdays.includes(dow));
      const hasMonthlyDay = unavailByMemberDate.has(`${memberId}|${d.dateStr}`);
      const hasMonthlyReqDay = monthlyUnavailable.some(
        (u) => u.memberId === memberId && u.date === d.dateStr && u.type === "REQUIRED_DATE",
      );
      const dayUnavail = hasMonthlyReqDay ? false : hasBaseDay || hasMonthlyDay;
      dayOff[d.dateStr] = dayUnavail;
      dayMust[d.dateStr] = hasMonthlyReqDay;
      baseDayOff[d.dateStr] = hasBaseDay;
      const wholeDayOff = dayOff[d.dateStr];
      for (const st of shiftTypes) {
        const item = monthlyUnavailable.find(
          (u) => u.memberId === memberId && u.date === d.dateStr && u.type === "UNAVAILABLE_SHIFT" && u.shiftTypeId === st.id,
        );
        const hasMonthlyReqShift = monthlyUnavailable.some(
          (u) => u.memberId === memberId && u.date === d.dateStr && u.type === "REQUIRED_SHIFT" && u.shiftTypeId === st.id,
        );
        const hasBaseShift = Boolean(member?.baseUnavailableShiftTypeIds.includes(st.id));
        const key = `${d.dateStr}|${st.id}`;
        let so = wholeDayOff || hasBaseShift || Boolean(item);
        if (hasMonthlyReqShift) so = false;
        shiftOff[key] = so;
        shiftMust[key] = hasMonthlyReqShift;
        baseShiftOff[key] = hasBaseShift;
      }
    }
    memberPopupBaselineRef.current = serializeMemberPopupState(
      !hasCalendarOverride,
      colorInit,
      dayOff,
      shiftOff,
      dayMust,
      shiftMust,
      dates,
      shiftTypes,
    );
    setMemberColorDraft(colorInit);
    setMemberDayOff(dayOff);
    setMemberShiftOff(shiftOff);
    setMemberDayMust(dayMust);
    setMemberShiftMust(shiftMust);
    setMemberBaseDayOff(baseDayOff);
    setMemberBaseShiftOff(baseShiftOff);
    setMemberPopupOpen(true);
    setMemberDiscardConfirmOpen(false);
  }

  function toggleDay(date: string) {
    const dayBase = memberBaseDayOff[date];
    const off = memberDayOff[date];
    const must = memberDayMust[date];
    let nOff = off;
    let nMust = must;

    if (dayBase) {
      if (off && !must) {
        nOff = false;
        nMust = false;
      } else if (!off && !must) {
        nOff = false;
        nMust = true;
      } else {
        nOff = true;
        nMust = false;
      }
    } else {
      if (!off && !must) {
        nOff = false;
        nMust = true;
      } else if (!off && must) {
        nOff = true;
        nMust = false;
      } else {
        nOff = false;
        nMust = false;
      }
    }

    setMemberDayOff((prev) => ({ ...prev, [date]: nOff }));
    setMemberDayMust((prev) => ({ ...prev, [date]: nMust }));

    if (nOff) {
      setMemberShiftOff((prev) => {
        const u = { ...prev };
        for (const st of shiftTypes) u[`${date}|${st.id}`] = true;
        return u;
      });
      setMemberShiftMust((prev) => {
        const u = { ...prev };
        for (const st of shiftTypes) u[`${date}|${st.id}`] = false;
        return u;
      });
    } else if (off && !must && !nOff && !nMust) {
      setMemberShiftOff((prev) => {
        const u = { ...prev };
        for (const st of shiftTypes) {
          const k = `${date}|${st.id}`;
          u[k] = Boolean(memberBaseShiftOff[k]);
        }
        return u;
      });
      setMemberShiftMust((prev) => {
        const u = { ...prev };
        for (const st of shiftTypes) u[`${date}|${st.id}`] = false;
        return u;
      });
    }
  }

  function toggleShift(date: string, shiftTypeId: string) {
    if (memberDayOff[date]) return;
    const key = `${date}|${shiftTypeId}`;
    const base = memberBaseShiftOff[key];
    const off = memberShiftOff[key];
    const must = memberShiftMust[key];
    let nOff = off;
    let nMust = must;

    if (base) {
      if (off && !must) {
        nOff = false;
        nMust = false;
      } else if (!off && !must) {
        nOff = false;
        nMust = true;
      } else {
        nOff = true;
        nMust = false;
      }
    } else {
      if (!off && !must) {
        nOff = false;
        nMust = true;
      } else if (!off && must) {
        nOff = true;
        nMust = false;
      } else {
        nOff = false;
        nMust = false;
      }
    }

    setMemberShiftOff((prev) => ({ ...prev, [key]: nOff }));
    setMemberShiftMust((prev) => ({ ...prev, [key]: nMust }));
  }

  /** Ripristina nello stato locale solo i vincoli dalla scheda membro (senza modifiche di periodo). */
  function applyAvailabilityFromGenericOnly() {
    if (!selectedMemberId) return;
    const member = memberById.get(selectedMemberId);
    const dayOff: Record<string, boolean> = {};
    const shiftOff: Record<string, boolean> = {};
    const dayMust: Record<string, boolean> = {};
    const shiftMust: Record<string, boolean> = {};
    for (const d of days) {
      const dow = utcDayOfWeek(d.dateStr);
      const hasBaseDay = Boolean(member?.baseUnavailableWeekdays.includes(dow));
      dayOff[d.dateStr] = hasBaseDay;
      dayMust[d.dateStr] = false;
      const wholeDayOff = dayOff[d.dateStr];
      for (const st of shiftTypes) {
        const hasBaseShift = Boolean(member?.baseUnavailableShiftTypeIds.includes(st.id));
        const k = `${d.dateStr}|${st.id}`;
        shiftOff[k] = wholeDayOff || hasBaseShift;
        shiftMust[k] = false;
      }
    }
    setMemberDayOff(dayOff);
    setMemberShiftOff(shiftOff);
    setMemberDayMust(dayMust);
    setMemberShiftMust(shiftMust);
    setMemberResetConfirmOpen(false);
  }

  async function saveMemberPopup() {
    if (!selectedMemberId) return;
    setLoadingKey("member-color");
    setError(null);
    const colorRes = await fetch(`/api/calendar-members/${selectedMemberId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ color: memberUseOrgColor ? null : memberColorDraft }),
    });
    const colorPayload = (await colorRes.json()) as { error?: string };
    if (!colorRes.ok) {
      setLoadingKey(null);
      setError(colorPayload.error ?? "Errore salvataggio colore");
      return;
    }

    for (const d of days) {
      if (!memberDayMust[d.dateStr] || memberDayOff[d.dateStr]) continue;
      const activeSts = shiftTypes.filter((st) => st.activeWeekdays.includes(utcDayOfWeek(d.dateStr)));
      if (activeSts.length === 0) continue;
      const allOff = activeSts.every((st) => memberShiftOff[`${d.dateStr}|${st.id}`]);
      if (allOff) {
        setLoadingKey(null);
        setError("Con DEVE giornata serve almeno un turno disponibile quel giorno.");
        return;
      }
    }

    const items: {
      type: "UNAVAILABLE_DATE" | "UNAVAILABLE_SHIFT" | "REQUIRED_DATE" | "REQUIRED_SHIFT";
      date: string;
      shiftTypeId?: string;
    }[] = [];
    for (const d of days) {
      if (memberDayOff[d.dateStr]) items.push({ type: "UNAVAILABLE_DATE", date: d.dateStr });
      if (!memberDayOff[d.dateStr] && memberDayMust[d.dateStr]) items.push({ type: "REQUIRED_DATE", date: d.dateStr });
      for (const st of shiftTypes) {
        const k = `${d.dateStr}|${st.id}`;
        if (memberShiftOff[k]) items.push({ type: "UNAVAILABLE_SHIFT", date: d.dateStr, shiftTypeId: st.id });
        if (!memberShiftOff[k] && memberShiftMust[k]) items.push({ type: "REQUIRED_SHIFT", date: d.dateStr, shiftTypeId: st.id });
      }
    }

    const checkedDeveCells = new Set<string>();
    for (const item of items) {
      if (item.type !== "REQUIRED_SHIFT" || !item.shiftTypeId) continue;
      const cellKey = `${item.date}|${item.shiftTypeId}`;
      if (checkedDeveCells.has(cellKey)) continue;
      checkedDeveCells.add(cellKey);
      const st = shiftTypes.find((s) => s.id === item.shiftTypeId);
      const cap = st?.maxStaff;
      if (cap == null) continue;
      const ids = new Set<string>();
      for (const u of monthlyUnavailable) {
        if (u.type !== "REQUIRED_SHIFT" || u.date !== item.date || u.shiftTypeId !== item.shiftTypeId) continue;
        if (u.memberId === selectedMemberId) continue;
        ids.add(u.memberId);
      }
      ids.add(selectedMemberId);
      if (ids.size > cap) {
        setLoadingKey(null);
        setError(
          `Per ${formatDateIt(item.date)} · ${st?.name ?? "?"} ci sono al massimo ${cap} posti: con questo DEVE risultano ${ids.size} persone obbligate sullo stesso turno.`,
        );
        return;
      }
    }

    const constraintsRes = await fetch(`/api/schedules/${scheduleId}/monthly-constraints`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberId: selectedMemberId, items }),
    });
    const constraintsPayload = (await constraintsRes.json()) as { error?: string };
    setLoadingKey(null);
    if (!constraintsRes.ok) {
      setError(constraintsPayload.error ?? "Errore salvataggio disponibilita");
      return;
    }
    closeMemberPopup(true);
    router.refresh();
  }

  async function moveAssignment(assignmentId: string, date: string, shiftTypeId: string) {
    setLoadingKey("move");
    setError(null);
    const res = await fetch(`/api/shift-assignments/${assignmentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, shiftTypeId }),
    });
    const payload = (await res.json()) as { error?: string };
    setLoadingKey(null);
    if (!res.ok) {
      setError(payload.error ?? "Errore spostamento");
      return;
    }
    router.refresh();
  }

  function getAssignmentIssueDetails(a: GridAssignment): { message: string; variant: "error" | "warning" } | null {
    const k = `${a.memberId}|${a.date}`;
    const overlap = (overlapByMemberDate.get(k) ?? 0) > 1;
    const unavailable = unavailSet.has(k) || unavailShiftSet.has(`${a.memberId}|${a.date}|${a.shiftTypeId}`);
    if (unavailable) return { message: "giorno non consentito", variant: "error" };
    if (overlap && multiRequiredShiftDaySet.has(k)) {
      return {
        message:
          "Più obblighi turno lo stesso giorno: eccezione al limite «un turno al giorno». Il dettaglio resta in «Visualizza report» → alert dalla griglia.",
        variant: "warning",
      };
    }
    if (overlap) return { message: "doppio turno stesso giorno", variant: "error" };
    return null;
  }

  function chipClass(a: GridAssignment) {
    const d = getAssignmentIssueDetails(a);
    if (!d) return "border border-0";
    return d.variant === "warning" ? "border border-warning border-2" : "border border-danger border-2";
  }

  function getAssignmentIssue(a: GridAssignment): string | null {
    return getAssignmentIssueDetails(a)?.message ?? null;
  }

  function setDragGhost(e: DragEvent, label: string) {
    const ghost = document.createElement("div");
    ghost.textContent = label;
    ghost.style.position = "absolute";
    ghost.style.top = "-9999px";
    ghost.style.left = "-9999px";
    ghost.style.padding = "6px 10px";
    ghost.style.borderRadius = "8px";
    ghost.style.background = "#ffffff";
    ghost.style.border = "1px solid #1f7a3f";
    ghost.style.color = "#1f7a3f";
    ghost.style.fontSize = "12px";
    ghost.style.fontWeight = "600";
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 12, 12);
    window.setTimeout(() => {
      if (ghost.parentNode) ghost.parentNode.removeChild(ghost);
    }, 0);
  }

  return (
    <div>
      {error ? (
        <div className="alert alert-danger py-2" role="alert">
          {error}
        </div>
      ) : null}
      {info ? (
        <div className="alert alert-success py-2" role="status">
          {info}
        </div>
      ) : null}
      {canManageSchedule || canEdit ? (
        <div className="mb-3 d-flex justify-content-end gap-2 flex-wrap">
          {canManageSchedule && scheduleStatus === "ARCHIVED" ? (
            <button
              type="button"
              className="btn btn-sm btn-outline-success"
              onClick={() => setRestoreOpen(true)}
              disabled={loadingKey !== null}
            >
              Ripristina nei turni
            </button>
          ) : canManageSchedule ? (
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              onClick={() => setArchiveOpen(true)}
              disabled={loadingKey !== null}
            >
              Archivia
            </button>
          ) : null}
          {(canManageSchedule || canEdit) && (
            <button className="btn btn-sm btn-outline-secondary" onClick={() => setPreviewOpen(true)} disabled={loadingKey !== null}>
              Visualizza
            </button>
          )}
          {canEdit ? (
            <button
              type="button"
              className="btn btn-sm btn-success"
              onClick={() => void generateAuto()}
              disabled={loadingKey !== null || shiftTypes.length === 0}
              title={
                shiftTypes.length === 0
                  ? "Serve almeno un tipo turno attivo nel calendario (pagina Calendario → Tipi di turno)."
                  : undefined
              }
            >
              {loadingKey === "generate" ? "Generazione..." : "Genera turni"}
            </button>
          ) : null}
        </div>
      ) : null}
      {canManageSchedule && !canEdit ? (
        <p className="small text-warning mb-0 mt-2">
          <strong>Genera turni</strong> e le modifiche alla griglia sono solo in <strong>bozza</strong>: qui il periodo è{" "}
          {scheduleStatus === "PUBLISHED" ? "pubblicato" : "archiviato"}. Ogni calendario segue gli stessi criteri; ciò che cambia è lo{" "}
          <strong>stato di questo turno</strong>, non il calendario di appartenenza.
        </p>
      ) : null}

      {shiftTypes.length === 0 ? (
        <div className="alert alert-warning border mb-0" role="status">
          Nessun tipo turno attivo: apri il calendario dalla home organizzazione, sezione «Tipi di turno», e crea o riattiva almeno un turno.
          Senza tipi di turno la griglia non è disponibile; il pulsante «Genera turni» resta disattivato finché non ce n’è almeno uno.
        </div>
      ) : (
      <>
      <div className="row g-3 align-items-stretch">
        <div className="col-xl-3">
          <div
            style={{
              position: "sticky",
              top: "0.75rem",
              zIndex: 10,
              maxHeight: "calc(100vh - 1.5rem)",
              overflowY: "auto",
            }}
          >
            <section className="card border shadow-none">
              <div className="card-body">
              <h2 className="h6 fw-semibold mb-2">Persone</h2>
              <div className="d-grid gap-1 mb-3">
                {members.map((m) => (
                  <div key={m.id} className="position-relative">
                  <button
                    type="button"
                    className="btn btn-sm text-start w-100 py-2 px-3"
                    style={
                      {
                        border: `1px solid ${m.memberColor ?? "#1f7a3f"}`,
                        backgroundColor:
                          memberPopupOpen && selectedMemberId === m.id ? `${m.memberColor ?? "#1f7a3f"}22` : "#fff",
                        color: m.memberColor ?? "#1f7a3f",
                        fontWeight: 600,
                        cursor: canEdit ? "grab" : "pointer",
                      }
                    }
                    draggable={canEdit}
                    onDragStart={(e) => {
                      setDragMemberId(m.id);
                      e.dataTransfer.setData("application/x-member-id", m.id);
                      e.dataTransfer.effectAllowed = "copy";
                      setDragging(true);
                      setDragGhost(e, m.label);
                    }}
                    onDragEnd={() => {
                      setDragging(false);
                      setHoverCellKey(null);
                    }}
                    onClick={() => {
                      openMemberPopup(m.id);
                    }}
                  >
                    {m.label}
                  </button>
                  </div>
                ))}
              </div>
              <p className="small text-secondary mt-2 mb-0">
                Trascina i nomi nelle celle. Clicca la persona per aprire disponibilita e colore.
              </p>
            </div>
            </section>
          </div>
        </div>
        <div className="col-xl-9">
      <div className="table-responsive">
        <table className="table table-sm table-bordered align-middle mb-0" style={{ minWidth: 620, tableLayout: "fixed" }}>
          <thead className="position-sticky top-0 bg-white" style={{ zIndex: 2 }}>
            <tr>
              <th scope="col" className="text-nowrap" style={{ width: 92 }}>
                Giorno
              </th>
              {shiftTypes.map((st) => (
                <th key={st.id} scope="col" className="text-center small" style={{ minWidth: 110 }}>
                  <div className="fw-semibold">{st.name}</div>
                  <div className="text-secondary text-nowrap">
                    {st.startTime} - {st.endTime}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {days.map((d) => {
              const dateStr = d.dateStr;
              const inactiveDay = !shiftTypes.some((st) => st.activeWeekdays.includes(utcDayOfWeek(dateStr)));
              return (
                <tr key={dateStr} className={inactiveDay ? "table-light" : undefined} style={{ height: 60 }}>
                  <th scope="row" className="text-nowrap small p-0 align-middle ps-1">
                    <span className="fw-semibold">{d.day}</span>{" "}
                    <span className="text-secondary text-capitalize">{d.weekday}</span>
                  </th>
                  {shiftTypes.map((st) => {
                    const cell = byCell.get(`${dateStr}|${st.id}`) ?? [];
                    const shiftInactive = !st.activeWeekdays.includes(utcDayOfWeek(dateStr));
                    const shiftBg = shiftInactive ? "#f8f9fa" : `${st.color}1A`;
                    return (
                      <td
                        key={`${dateStr}-${st.id}`}
                        className="align-middle p-0"
                        style={{
                          background: shiftBg,
                          height: 60,
                          minHeight: 60,
                          maxHeight: 60,
                          verticalAlign: "middle",
                          outline: hoverCellKey === `${dateStr}|${st.id}` ? "2px dashed #1f7a3f" : undefined,
                          outlineOffset: -2,
                          cursor: canEdit && !shiftInactive ? "copy" : "default",
                        }}
                        onDragOver={(e) => {
                          if (canEdit && !shiftInactive) {
                            e.preventDefault();
                            setHoverCellKey(`${dateStr}|${st.id}`);
                            const types = Array.from(e.dataTransfer.types ?? []);
                            e.dataTransfer.dropEffect = types.includes("application/x-assignment-id") ? "move" : "copy";
                          }
                        }}
                        onDragLeave={() => {
                          setHoverCellKey((prev) => (prev === `${dateStr}|${st.id}` ? null : prev));
                        }}
                        onDrop={(e) => {
                          if (!canEdit || shiftInactive) return;
                          e.preventDefault();
                          setHoverCellKey(null);
                          const assignmentId = e.dataTransfer.getData("application/x-assignment-id");
                          if (assignmentId) {
                            void moveAssignment(assignmentId, dateStr, st.id);
                            return;
                          }
                          const droppedMemberId = e.dataTransfer.getData("application/x-member-id") || dragMemberId;
                          if (droppedMemberId) void addAssignment(dateStr, st.id, droppedMemberId);
                        }}
                      >
                        <div className="d-flex flex-wrap gap-1 align-items-center px-1" style={{ minHeight: 60 }}>
                          {cell.map((a) => (
                            (() => {
                              const m = memberById.get(a.memberId);
                              const textColor = m?.memberColor ?? "#1f2937";
                              const bg = m?.memberColor ? `${m.memberColor}20` : `${a.shiftTypeColor}40`;
                              const issueDetail = getAssignmentIssueDetails(a);
                              const hasProblem = Boolean(issueDetail);
                              const issue = issueDetail?.message ?? null;
                              return (
                            <div
                              key={a.id}
                              className={`d-inline-flex align-items-center gap-2 rounded-2 px-3 py-2 ${chipClass(a)}`}
                              style={{
                                backgroundColor: bg,
                                borderColor:
                                  issueDetail?.variant === "warning"
                                    ? "#ffc107"
                                    : issueDetail?.variant === "error"
                                      ? "#dc3545"
                                      : undefined,
                                maxWidth: "100%",
                                cursor: canEdit ? "grab" : "default",
                              }}
                              draggable={canEdit}
                              onDragStart={(e) => {
                                e.dataTransfer.setData("application/x-assignment-id", a.id);
                                e.dataTransfer.effectAllowed = "move";
                                setDragging(true);
                                setDragGhost(e, a.memberLabel);
                              }}
                              onDragEnd={() => {
                                setDragging(false);
                                setHoverCellKey(null);
                              }}
                            >
                              <span
                                className="small fw-semibold text-truncate"
                                style={{ color: textColor, maxWidth: 120 }}
                                title={a.memberLabel}
                              >
                                {a.memberLabel}
                              </span>
                              {issue ? (
                                <span
                                  className={`small fw-semibold ${issueDetail?.variant === "warning" ? "text-warning-emphasis" : "text-danger"}`}
                                  style={{ fontSize: 11 }}
                                  title={issue}
                                >
                                  !
                                </span>
                              ) : null}
                              {canEdit ? (
                                <button
                                  type="button"
                                  className="border-0 bg-transparent d-inline-flex align-items-center justify-content-center"
                                  aria-label="Rimuovi"
                                  disabled={loadingKey !== null}
                                  onClick={() => setDeleteId(a.id)}
                                  style={{ width: 18, height: 18, color: "#b42318", borderRadius: "50%" }}
                                >
                                  <span style={{ fontSize: 14, lineHeight: 1 }}>✕</span>
                                </button>
                              ) : null}
                            </div>
                              );
                            })()
                          ))}
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
        </div>
      </div>

      {!reportPanelOpen ? (
        <>
          <section className="card mt-3">
            <div className="card-body py-3">
              <div>
                <h2 className="h6 fw-semibold mb-1">Regole turno</h2>
                <p className="small text-secondary mb-0">
                  Regole HARD per slot (giorno×turno): co-presenza (“deve stare con”) ed esclusione (“non deve stare con”).
                </p>
                {!canEditRules ? (
                  <p className="small text-warning mb-0 mt-1">Modifica consentita solo quando il turno è in bozza.</p>
                ) : null}
              </div>

              {rulesDraft.length === 0 ? (
                <div className="mt-3 d-flex justify-content-between align-items-center gap-2 flex-wrap">
                  <p className="small text-secondary mb-0">Non ci sono regole.</p>
                  <button type="button" className="btn btn-sm btn-success" onClick={() => openRuleModal(null)} disabled={!canEditRules || loadingKey !== null}>
                    Aggiungi regola
                  </button>
                </div>
              ) : (
                <div className="d-grid gap-2 mt-3">
                  {rulesDraft.map((r) => (
                    <div key={r.id} className="border rounded-3 p-3 d-flex justify-content-between align-items-start gap-3 flex-wrap">
                      <div style={{ minWidth: 260, flex: 1 }}>
                        <div className="fw-semibold">{r.name}</div>
                        <div className="small text-secondary">
                          {r.kind === "ALWAYS_WITH" ? "Deve stare con" : "Non deve stare con"} ·{" "}
                          {(r.dates && r.dates.length) ? `${r.dates.length} giorni selezionati` : "Sempre (tutto il periodo)"}
                        </div>
                      </div>
                      <div className="d-flex gap-2">
                        <button type="button" className="btn btn-sm btn-outline-success" onClick={() => openRuleModal(r.id)} disabled={loadingKey !== null || !canEditRules}>
                          Modifica
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-danger"
                          onClick={() => setDeleteRuleTargetId(r.id)}
                          disabled={loadingKey !== null || !canEditRules}
                        >
                          Elimina
                        </button>
                      </div>
                    </div>
                  ))}
                  <div className="d-flex justify-content-end mt-1">
                    <button type="button" className="btn btn-sm btn-success" onClick={() => openRuleModal(null)} disabled={!canEditRules || loadingKey !== null}>
                      Aggiungi regola
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>

          <div className="mt-3 d-flex flex-wrap align-items-center gap-2">
            <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => setReportPanelOpen(true)}>
              Visualizza report
            </button>
            <span className="small text-secondary mb-0">
              Riepilogo, totali, copertura e alert dalla griglia compaiono solo dopo «Visualizza report».
            </span>
          </div>
        </>
      ) : null}

      {ruleModalOpen ? (
        <>
          <div className="modal fade show d-block" tabIndex={-1} role="dialog" aria-modal="true">
            <div className="modal-dialog modal-dialog-centered modal-xl">
              <div className="modal-content turny-modal">
                <div className="modal-header">
                  <h5 className="modal-title">{editingRuleId ? "Modifica regola" : "Nuova regola"}</h5>
                  <button type="button" className="btn-close" aria-label="Chiudi" onClick={() => setRuleModalOpen(false)} />
                </div>
                <div className="modal-body pb-4">
                  {ruleModalError ? <div className="alert alert-danger py-2 mb-3">{ruleModalError}</div> : null}
                  <div className="row g-3">
                    <div className="col-12 col-lg-6">
                      <label className="form-label small mb-1">Nome</label>
                      <input
                        className="form-control"
                        value={ruleName}
                        onChange={(e) => setRuleName(e.target.value)}
                        placeholder="Es. Tirocinante con tutor"
                      />
                    </div>

                    <div className="col-12 col-lg-6">
                      <label className="form-label small mb-1">Giorni (opzionale)</label>
                      <div>
                        <DateMultiPicker
                          selectedDates={ruleDates}
                          onChange={setRuleDates}
                          allowedDates={dates}
                          triggerLabel="Seleziona giorni"
                        />
                        {!ruleDates.length ? <span className="small text-secondary d-block mt-1">Lascia vuoto → vale per tutto il periodo</span> : null}
                      </div>
                    </div>

                    <div className="col-12 col-lg-5">
                      <label className="form-label small mb-1">Se (persona/ruolo)</label>
                      <input
                        className="form-control"
                        value={ifQuery}
                        onChange={(e) => setIfQuery(e.target.value)}
                        placeholder="Scrivi per cercare persone o ruoli…"
                      />
                      {ifQuery.trim() ? (
                        <div className="border rounded-3 mt-2 bg-white" style={{ maxHeight: 220, overflowY: "auto" }}>
                          {selectorOptions
                            .filter((o) => o.label.toLowerCase().includes(ifQuery.trim().toLowerCase()))
                            .slice(0, 30)
                            .map((o) => (
                              <button
                                key={`ifopt-${o.key}`}
                                type="button"
                                className="w-100 text-start bg-white border-0 py-2 px-2"
                                onClick={() => {
                                  setRuleIfSelectors((prev) => (prev.includes(o.key) ? prev : [...prev, o.key]));
                                  setIfQuery("");
                                }}
                                style={{ borderBottom: "1px solid #eef2f3" }}
                              >
                                {o.label}
                              </button>
                            ))}
                        </div>
                      ) : null}
                      {ruleIfSelectors.length ? (
                        <div className="d-flex flex-wrap gap-1 mt-2">
                          {ruleIfSelectors.map((s) => (
                            <span
                              key={`ifsel-${s}`}
                              className="badge border d-inline-flex align-items-center gap-1"
                              style={
                                s.startsWith("ROLE:")
                                  ? { backgroundColor: "#f3f4f6", color: "#374151" }
                                  : { backgroundColor: `${selectorColor(s) ?? "#1f7a3f"}1f`, color: selectorColor(s) ?? "#1f7a3f" }
                              }
                            >
                              {selectorLabel(s)}{" "}
                              <button type="button" className="border-0 bg-transparent" onClick={() => setRuleIfSelectors((p) => p.filter((x) => x !== s))}>
                                ✕
                              </button>
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>

                    <div className="col-12 col-lg-2">
                      <label className="form-label small mb-1">Relazione</label>
                      <select
                        className="form-select"
                        value={ruleKind}
                        onChange={(e) => setRuleKind(e.target.value === "NEVER_WITH" ? "NEVER_WITH" : "ALWAYS_WITH")}
                      >
                        <option value="ALWAYS_WITH">Deve stare con</option>
                        <option value="NEVER_WITH">Non deve stare con</option>
                      </select>
                    </div>

                    <div className="col-12 col-lg-5">
                      <label className="form-label small mb-1">Con (persona/ruolo)</label>
                      <input
                        className="form-control"
                        value={thenQuery}
                        onChange={(e) => setThenQuery(e.target.value)}
                        placeholder="Scrivi per cercare persone o ruoli…"
                      />
                      {thenQuery.trim() ? (
                        <div className="border rounded-3 mt-2 bg-white" style={{ maxHeight: 220, overflowY: "auto" }}>
                          {selectorOptions
                            .filter((o) => o.label.toLowerCase().includes(thenQuery.trim().toLowerCase()))
                            .slice(0, 30)
                            .map((o) => (
                              <button
                                key={`thenopt-${o.key}`}
                                type="button"
                                className="w-100 text-start bg-white border-0 py-2 px-2"
                                onClick={() => {
                                  setRuleThenSelectors((prev) => (prev.includes(o.key) ? prev : [...prev, o.key]));
                                  setThenQuery("");
                                }}
                                style={{ borderBottom: "1px solid #eef2f3" }}
                              >
                                {o.label}
                              </button>
                            ))}
                        </div>
                      ) : null}
                      {ruleThenSelectors.length ? (
                        <div className="d-flex flex-wrap gap-1 mt-2">
                          {ruleThenSelectors.map((s) => (
                            <span
                              key={`thensel-${s}`}
                              className="badge border d-inline-flex align-items-center gap-1"
                              style={
                                s.startsWith("ROLE:")
                                  ? { backgroundColor: "#f3f4f6", color: "#374151" }
                                  : { backgroundColor: `${selectorColor(s) ?? "#1f7a3f"}1f`, color: selectorColor(s) ?? "#1f7a3f" }
                              }
                            >
                              {selectorLabel(s)}{" "}
                              <button type="button" className="border-0 bg-transparent" onClick={() => setRuleThenSelectors((p) => p.filter((x) => x !== s))}>
                                ✕
                              </button>
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
                <div className="modal-footer d-flex justify-content-between">
                  <button type="button" className="btn btn-outline-secondary" onClick={() => setRuleModalOpen(false)} disabled={loadingKey !== null}>
                    Annulla
                  </button>
                  <button
                    type="button"
                    className="btn btn-success"
                    disabled={loadingKey !== null || !canEditRules || ruleName.trim().length < 2 || ruleIfSelectors.length === 0 || ruleThenSelectors.length === 0}
                    onClick={() => {
                      const id = editingRuleId ?? crypto.randomUUID();
                      const next: RuleDraft = {
                        id,
                        name: ruleName.trim(),
                        kind: ruleKind,
                        ifSelectors: ruleIfSelectors,
                        thenSelectors: ruleThenSelectors,
                        dates: ruleDates.length ? ruleDates : undefined,
                      };
                      const nextRules = editingRuleId ? rulesDraft.map((r) => (r.id === id ? next : r)) : [...rulesDraft, next];
                      void (async () => {
                        const ok = await saveAllRules(nextRules, true);
                        if (ok) setRuleModalOpen(false);
                      })();
                    }}
                  >
                    Salva
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div role="presentation" onClick={() => setRuleModalOpen(false)} style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.06)", zIndex: 1040 }} />
        </>
      ) : null}

      {reportPanelOpen ? (
        <>
      <section className="card mt-3">
        <div className="card-body py-2">
          <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
            <h2 className="h6 fw-semibold mb-0">Riepilogo per persona</h2>
            <ScheduleReportCsvButton
              filename={reportCsvFilename}
              rows={riepilogoPerPersona.map((r) => ({
                label: r.label,
                shiftCount: r.shiftCount,
                nightCount: r.nightCount,
                satCount: r.satCount,
                sunCount: r.sunCount,
                hoursTotal: r.hoursTotal,
                freeDays: r.freeDays,
                freeWeekend: r.freeWeekend,
              }))}
            />
          </div>
          <div className="table-responsive">
            <table className="table table-sm table-bordered mb-0">
              <thead>
                <tr>
                  <th className="py-2 ps-3 pe-3">Persona</th>
                  <th className="text-end">Turni</th>
                  <th className="text-end">Notti</th>
                  <th className="text-end">Sabati</th>
                  <th className="text-end">Domeniche</th>
                  <th className="text-end">Ore</th>
                  <th className="text-end">Gg liberi</th>
                </tr>
              </thead>
              <tbody>
                {riepilogoPerPersona.map((r) => {
                  const rowColor = memberById.get(r.memberId)?.memberColor;
                  const rowBg = rowColor ? `${rowColor}14` : undefined;
                  return (
                    <tr key={r.memberId} style={{ backgroundColor: rowBg }}>
                      <td className="py-2 ps-3 pe-3">{r.label}</td>
                      <td className="text-end">{r.shiftCount}</td>
                      <td className="text-end">{r.nightCount > 0 ? r.nightCount : "—"}</td>
                      <td className="text-end">{r.satCount > 0 ? r.satCount : "—"}</td>
                      <td className="text-end">{r.sunCount > 0 ? r.sunCount : "—"}</td>
                      <td className="text-end">{r.hoursTotal}</td>
                      <td className="text-end">{r.freeDays}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="small text-secondary mt-2 mb-0">
            Gg liberi: giorni del periodo senza turni assegnati.
          </p>
        </div>
      </section>

      <section className="row g-3 mt-2">
        <div className="col-md-4">
          <div className="border rounded p-3 h-100">
            <p className="small text-secondary mb-1">Assegnazioni totali</p>
            <p className="h4 fw-bold mb-0">{reportSummary.totals.assignments}</p>
          </div>
        </div>
        <div className="col-md-4">
          <div className="border rounded p-3 h-100">
            <p className="small text-secondary mb-1">Ore coperte (stimato)</p>
            <p className="h4 fw-bold mb-0">{reportSummary.totals.hours}</p>
          </div>
        </div>
        <div className="col-md-4">
          <div className="border rounded p-3 h-100">
            <p className="small text-secondary mb-1">Slot giorno×turno controllati</p>
            <p className="h4 fw-bold mb-0">{reportSummary.totals.shiftSlotsChecked}</p>
          </div>
        </div>
      </section>

      <section className="card mt-3">
        <div className="card-body py-2">
          <h2 className="h6 fw-semibold mb-2">Copertura min/max staff</h2>
          {reportSummary.coverageAlerts.length === 0 ? (
            <p className="text-secondary small mb-0">Nessun alert: tutte le celle attive rispettano min/max.</p>
          ) : (
            <div className="table-responsive">
              <table className="table table-sm table-bordered mb-0">
                <thead>
                  <tr>
                    <th>Tipo</th>
                    <th>Data</th>
                    <th>Turno</th>
                    <th className="text-end">Assegnati</th>
                    <th className="text-end">Min</th>
                    <th className="text-end">Max</th>
                  </tr>
                </thead>
                <tbody>
                  {reportSummary.coverageAlerts.map((a, i) => (
                    <tr key={`${a.date}-${a.shiftTypeId}-${a.kind}-${i}`}>
                      <td>
                        {a.kind === "UNDERSTAFFED" ? (
                          <span className="text-danger">Sottocopertura</span>
                        ) : (
                          <span className="text-warning">Sovraffollamento</span>
                        )}
                      </td>
                      <td>{formatReportCellDate(a.date)}</td>
                      <td>{a.shiftName}</td>
                      <td className="text-end">{a.count}</td>
                      <td className="text-end">{a.minStaff}</td>
                      <td className="text-end">{a.maxStaff ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {alerts.length > 0 ? (
        <section className="card mt-3 border-warning">
          <div className="card-body py-2">
            <h2 className="h6 fw-semibold mb-2">Alert dalla griglia</h2>
            <ul className="small mb-0 ps-3">
              {alerts.map((a, i) => (
                <li key={i} className={a.level === "ERROR" ? "text-danger" : "text-warning"}>
                  {a.text}
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      <div className="mt-3 d-flex flex-wrap gap-2">
        <button type="button" className="btn btn-sm btn-secondary" onClick={() => setReportPanelOpen(false)}>
          Nascondi report
        </button>
      </div>
        </>
      ) : null}

      {(canEdit || (canManageSchedule && scheduleStatus === "DRAFT")) ? (
        <section className="card mt-3 border-secondary border-opacity-25">
          <div className="card-body py-3 d-flex flex-wrap justify-content-end gap-2">
            {canEdit ? (
              <>
                <button type="button" className="btn btn-outline-danger" onClick={() => setClearOpen(true)} disabled={loadingKey !== null}>
                  Svuota
                </button>
                <button type="button" className="btn btn-success px-4" onClick={() => void saveAll()} disabled={loadingKey !== null}>
                  {loadingKey === "sync" ? "Salvataggio..." : "Salva"}
                </button>
              </>
            ) : null}
            {canManageSchedule && scheduleStatus === "DRAFT" ? (
              <button
                type="button"
                className="btn btn-outline-success px-4"
                onClick={() => setPublishOpen(true)}
                disabled={loadingKey !== null}
              >
                Pubblica
              </button>
            ) : null}
          </div>
        </section>
      ) : null}
      </>
      )}

      <InfeasibleGenerateModal
        open={infeasibleModal.open}
        onClose={() => setInfeasibleModal((s) => ({ ...s, open: false }))}
        message={infeasibleModal.message}
        hints={infeasibleModal.hints}
        orgSlug={orgSlug}
        calId={calId}
      />

      <ConfirmModal
        open={memberDiscardConfirmOpen}
        nested
        title="Modifiche non salvate"
        message="Hai modificato indisponibilità o colore senza salvare. Uscire dalla scheda persona e annullare le modifiche?"
        confirmLabel="Abbandona"
        cancelLabel="Continua a modificare"
        confirmVariant="danger"
        loading={false}
        onCancel={() => setMemberDiscardConfirmOpen(false)}
        onConfirm={() => closeMemberPopup(true)}
      />
      <ConfirmModal
        open={memberResetConfirmOpen}
        nested
        title="Reset indisponibilità"
        message="Le indisponibilità che hai impostato in questa scheda verranno eliminate e ripristinate quelle generiche"
        confirmLabel="Ripristina generici"
        cancelLabel="Annulla"
        confirmVariant="danger"
        loading={false}
        onCancel={() => setMemberResetConfirmOpen(false)}
        onConfirm={applyAvailabilityFromGenericOnly}
      />
      <ConfirmModal
        open={deleteId !== null}
        title="Rimuovi assegnazione"
        message="Rimuovere questa persona dal turno?"
        confirmLabel="Rimuovi"
        cancelLabel="Annulla"
        confirmVariant="danger"
        loading={loadingKey?.endsWith("|del") ?? false}
        onCancel={() => setDeleteId(null)}
        onConfirm={() => (deleteId ? void removeAssignment(deleteId) : undefined)}
      />
      <ConfirmModal
        open={clearOpen}
        title="Svuota turno"
        message="Confermi lo svuotamento di tutte le assegnazioni del periodo?"
        confirmLabel="Svuota"
        cancelLabel="Annulla"
        confirmVariant="danger"
        loading={loadingKey === "clear"}
        onCancel={() => setClearOpen(false)}
        onConfirm={() => void clearAllAssignments()}
      />
      <ConfirmModal
        open={publishOpen}
        title="Pubblica turni"
        message="Pubblicare questo periodo? Il team potrà consultare i turni assegnati (stato pubblicato)."
        confirmLabel="Pubblica"
        cancelLabel="Annulla"
        confirmVariant="success"
        loading={loadingKey === "publish"}
        onCancel={() => setPublishOpen(false)}
        onConfirm={() => void publishSchedule()}
      />
      <ConfirmModal
        open={archiveOpen}
        title="Archivia schedule"
        message="Il periodo uscirà dall'elenco turni attivi e sarà consultabile in Archivio. Continuare?"
        confirmLabel="Archivia"
        cancelLabel="Annulla"
        confirmVariant="primary"
        loading={loadingKey === "archive"}
        onCancel={() => setArchiveOpen(false)}
        onConfirm={() => void archiveSchedule()}
      />
      <ConfirmModal
        open={restoreOpen}
        title="Ripristina nei turni"
        message="Il schedule tornerà visibile nell'elenco turni come pubblicato. Per modificarlo di nuovo le assegnazioni serve riportarlo in bozza dal report."
        confirmLabel="Ripristina"
        cancelLabel="Annulla"
        confirmVariant="success"
        loading={loadingKey === "restore"}
        onCancel={() => setRestoreOpen(false)}
        onConfirm={() => void restoreSchedule()}
      />
      <ConfirmModal
        open={deleteRuleTargetId !== null}
        title="Elimina regola"
        message="Sei sicuro di voler eliminare questa regola? L'operazione non è reversibile."
        confirmLabel="Elimina"
        confirmVariant="danger"
        loading={loadingKey === "rules"}
        onCancel={() => setDeleteRuleTargetId(null)}
        onConfirm={() => {
          if (!deleteRuleTargetId) return;
          const next = rulesDraft.filter((x) => x.id !== deleteRuleTargetId);
          void (async () => {
            await saveAllRules(next, false);
            setDeleteRuleTargetId(null);
          })();
        }}
      />
      {memberPopupOpen && selectedMemberId ? (
        <>
          <div className="modal fade show d-block" tabIndex={-1} role="dialog" aria-modal="true">
            <div className="modal-dialog modal-dialog-centered modal-lg">
              <div className="modal-content turny-modal">
                <div className="modal-header">
                  <div>
                    <h5 className="modal-title mb-0">
                      Scheda turni {memberById.get(selectedMemberId)?.label ?? ""}
                    </h5>
                    {memberById.get(selectedMemberId)?.professionalRole ? (
                      <small className="text-secondary">{memberById.get(selectedMemberId)!.professionalRole}</small>
                    ) : null}
                  </div>
                  <button type="button" className="btn-close" aria-label="Chiudi" onClick={() => closeMemberPopup(false)} />
                </div>
                <div className="modal-body pb-4">
                  {(() => {
                    const mem = memberById.get(selectedMemberId);
                    const cfgParts: { label: string; value: string }[] = [];
                    if (mem?.contractShiftsMonth != null)
                      cfgParts.push({ label: "Max turni", value: `fino a ${mem.contractShiftsMonth} nel periodo` });
                    if (mem?.configMaxNights != null)
                      cfgParts.push({ label: "Max notti", value: String(mem.configMaxNights) });
                    if (mem?.configMaxSaturdays != null)
                      cfgParts.push({ label: "Max sabati", value: String(mem.configMaxSaturdays) });
                    if (mem?.configMaxSundays != null)
                      cfgParts.push({ label: "Max domeniche", value: String(mem.configMaxSundays) });
                    if (cfgParts.length === 0) return null;
                    return (
                      <div className="d-flex flex-wrap gap-3 mb-2">
                        {cfgParts.map((p) => (
                          <span key={p.label} className="small text-secondary">
                            <strong>{p.label}:</strong> {p.value}
                          </span>
                        ))}
                      </div>
                    );
                  })()}
                  <div className="row g-3">
                    <div className="col-md-4">
                      <ColorPalettePicker
                        value={memberColorDraft}
                        onChange={(hex) => {
                          setMemberUseOrgColor(false);
                          setMemberColorDraft(hex);
                        }}
                        inheritOption
                        inheritSelected={memberUseOrgColor}
                        onSelectInherit={() => setMemberUseOrgColor(true)}
                        label="Colore"
                        disabled={loadingKey !== null}
                      />
                    </div>
                    <div className="col-12">
                      <p className="small text-secondary mb-2">
                        Verde contorno = disponibile
                        <br />
                        Verde pieno = obbligatorio
                        <br />
                        Rosso pieno = indisponibile
                        <br />
                        Bordo rosso = disponibile nonostante un vincolo generico
                        <br />
                        Bordo rosso fondo verde = obbligo nonostante vincolo generico
                      </p>
                      <div className="d-grid gap-2">
                        {days.map((d) => {
                          const dayOff = memberDayOff[d.dateStr];
                          const dayMust = memberDayMust[d.dateStr];
                          const dayBase = memberBaseDayOff[d.dateStr];
                          let dayTileClass = "btn-outline-success";
                          if (dayOff && !dayMust) dayTileClass = "btn-danger";
                          else if (!dayOff && dayMust && dayBase) dayTileClass = "schedule-member-must-generic-bypass-btn";
                          else if (!dayOff && dayMust && !dayBase) dayTileClass = "btn-success";
                          else if (!dayOff && !dayMust && dayBase) dayTileClass = "schedule-member-generic-bypass-btn";
                          return (
                            <div key={d.dateStr} className="d-flex align-items-center gap-2">
                              <button
                                type="button"
                                className={`btn btn-sm schedule-member-popup-tile ${dayTileClass}`}
                                onClick={() => toggleDay(d.dateStr)}
                                disabled={loadingKey !== null}
                                style={{ width: 120, justifyContent: "center" }}
                                title={
                                  dayBase
                                    ? dayOff
                                      ? "Indisponibile (come da vincolo generico o da periodo)"
                                      : dayMust
                                        ? undefined
                                        : "Disponibile: vincolo generico sul giorno superato per questo periodo"
                                    : undefined
                                }
                              >
                                {d.day} {d.weekday}
                              </button>
                              <div className="d-flex flex-wrap gap-1">
                                {shiftTypes.map((st) => {
                                  const key = `${d.dateStr}|${st.id}`;
                                  const active = memberShiftOff[key];
                                  const base = memberBaseShiftOff[key];
                                  const smust = memberShiftMust[key];
                                  const dayGenericUnlocked =
                                    dayBase && !dayOff && !memberDayMust[d.dateStr];
                                  const shiftBypass = !active && (base || dayGenericUnlocked);
                                  let shiftTileClass = "btn-outline-success";
                                  if (active && !smust) shiftTileClass = "btn-danger";
                                  else if (!active && smust && (base || dayGenericUnlocked))
                                    shiftTileClass = "schedule-member-must-generic-bypass-btn";
                                  else if (!active && smust) shiftTileClass = "btn-success";
                                  else if (!active && !smust && shiftBypass) shiftTileClass = "schedule-member-generic-bypass-btn";
                                  return (
                                    <button
                                      key={key}
                                      type="button"
                                      className={`btn btn-sm schedule-member-popup-tile ${shiftTileClass}`}
                                      onClick={() => toggleShift(d.dateStr, st.id)}
                                      disabled={loadingKey !== null || dayOff}
                                      title={
                                        base
                                          ? active
                                            ? "Indisponibile"
                                            : smust
                                              ? undefined
                                              : "Disponibile: vincolo generico sul tipo turno superato"
                                          : dayBase && !dayOff && !active && !smust
                                            ? "Disponibile allineato al giorno (generico sul weekday superato)"
                                            : undefined
                                      }
                                    >
                                      {st.name}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    <div className="col-12 d-flex flex-wrap justify-content-end gap-2">
                      <button className="btn btn-outline-secondary" onClick={() => closeMemberPopup(false)} disabled={loadingKey !== null}>
                        Annulla
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline-danger"
                        onClick={() => setMemberResetConfirmOpen(true)}
                        disabled={loadingKey !== null}
                      >
                        Reset indisponibilità
                      </button>
                      <button className="btn btn-success" onClick={() => void saveMemberPopup()} disabled={loadingKey !== null}>
                        Salva
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div
            role="presentation"
            onClick={() => closeMemberPopup(false)}
            style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.06)", zIndex: 1040 }}
          />
        </>
      ) : null}
      {previewOpen ? (
        <>
          <div className="modal fade show d-block" tabIndex={-1} role="dialog" aria-modal="true">
            <div className="modal-dialog" style={{ maxWidth: "95vw", width: "95vw" }}>
              <div className="modal-content turny-modal" style={{ minHeight: "88vh" }}>
                <div className="modal-header">
                  <div className="d-flex flex-column">
                    <h5 className="modal-title mb-1">Calendario {calendarName ?? ""} {periodLabel ?? ""}</h5>
                    <div className="d-flex align-items-center gap-2 flex-wrap" aria-label="Viste visualizzazione">
                      <button
                        type="button"
                        className={`btn btn-sm ${viewMode === "standard" ? "btn-success" : "btn-outline-success"}`}
                        onClick={() => setViewMode("standard")}
                      >
                        <Image
                          src="/badge.svg"
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
                          src="/icon-calendar.svg"
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
                          src="/badge.svg"
                          alt=""
                          width={20}
                          height={20}
                          style={{ marginRight: 8, filter: viewMode === "mine" ? "brightness(0) invert(1)" : "none" }}
                        />
                        I miei turni
                      </button>
                    </div>
                  </div>
                  <button type="button" className="btn-close" aria-label="Chiudi" onClick={() => setPreviewOpen(false)} />
                </div>
                <div className="modal-body p-3">
                  {viewMode === "standard" ? (
                  <div className="table-responsive">
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
                        {days.map((d) => (
                          <tr key={`preview-row-${d.dateStr}`} style={{ height: 60 }}>
                            <th className="p-0 align-middle ps-1 small">
                              <div className="fw-semibold">{d.day}</div>
                              <div className="small text-secondary text-capitalize">{d.weekday}</div>
                            </th>
                            {shiftTypes.map((st) => {
                              const cell = byCell.get(`${d.dateStr}|${st.id}`) ?? [];
                              const shiftInactive = !st.activeWeekdays.includes(utcDayOfWeek(d.dateStr));
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
                                  }}
                                >
                                  <div className="d-flex flex-wrap gap-1 align-items-center px-1" style={{ minHeight: 60 }}>
                                    {cell.map((a) => {
                                      const m = memberById.get(a.memberId);
                                      const chipBg = m?.memberColor ? `${m.memberColor}1f` : `${a.shiftTypeColor}2a`;
                                      return (
                                        <span
                                          key={`preview-chip-${a.id}`}
                                          className="d-inline-flex align-items-center rounded-2 px-3 py-2 small fw-semibold"
                                          style={{ backgroundColor: chipBg, color: m?.memberColor ?? "#1f2937" }}
                                        >
                                          {a.memberLabel}
                                        </span>
                                      );
                                    })}
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  ) : null}
                  {viewMode === "calendar" ? (
                    <div className="row g-2">
                      {days.map((d) => (
                        <div key={`cal-${d.dateStr}`} className="col-12 col-md-6 col-xl-4">
                          <div className="border rounded-3 p-2 h-100 bg-white">
                            <p className="fw-semibold mb-2">{d.weekday} {d.day}</p>
                            <div className="d-grid gap-2">
                              {shiftTypes.map((st) => {
                                const cell = byCell.get(`${d.dateStr}|${st.id}`) ?? [];
                                const inactive = !st.activeWeekdays.includes(utcDayOfWeek(d.dateStr));
                                return (
                                  <div key={`cal-${d.dateStr}-${st.id}`} className="rounded-2 p-2" style={{ background: inactive ? "#f8f9fa" : `${st.color}18` }}>
                                    <div className="small fw-semibold">
                                      {st.name} <span className="text-secondary fw-normal">{st.startTime}-{st.endTime}</span>
                                    </div>
                                    <div className="d-flex flex-wrap gap-1 mt-1">
                                      {cell.length === 0 ? <span className="small text-secondary">—</span> : null}
                                      {cell.slice(0, 3).map((a) => {
                                        const m = memberById.get(a.memberId);
                                        return (
                                          <span key={`cal-chip-${a.id}`} className="d-inline-flex rounded-2 px-3 py-2 small fw-semibold" style={{ backgroundColor: m?.memberColor ? `${m.memberColor}1f` : `${a.shiftTypeColor}2a`, color: m?.memberColor ?? "#1f2937" }}>
                                            {a.memberLabel}
                                          </span>
                                        );
                                      })}
                                      {cell.length > 3 ? <span className="badge text-bg-light">+{cell.length - 3}</span> : null}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {viewMode === "mine" ? (
                    <div>
                      <div className="d-flex justify-content-between align-items-center gap-2 flex-wrap mb-3">
                        <h2 className="h6 fw-semibold mb-0">I miei turni</h2>
                        <button className="btn btn-sm btn-outline-success" onClick={downloadMyIcs} disabled={!myMember}>
                          Esporta ICS
                        </button>
                      </div>
                      {!myMember ? (
                        <p className="small text-secondary mb-0">Nessun profilo worker associato a questo calendario.</p>
                      ) : (
                        <>
                          <div className="row g-2 mb-3">
                            <div className="col-md-4"><div className="border rounded-3 p-3"><div className="small text-secondary">Persona</div><div className="fw-semibold">{myMember.label}</div></div></div>
                            <div className="col-md-4"><div className="border rounded-3 p-3"><div className="small text-secondary">Turni</div><div className="fw-semibold">{myAssignments.length}</div></div></div>
                            <div className="col-md-4"><div className="border rounded-3 p-3"><div className="small text-secondary">Ore totali</div><div className="fw-semibold">{Math.round(myHours * 10) / 10}</div></div></div>
                          </div>
                          <div className="table-responsive">
                            <table className="table table-sm table-bordered mb-0">
                              <thead><tr><th>Data</th><th>Turno</th><th>Orario</th></tr></thead>
                              <tbody>
                                {myAssignments.map((a) => {
                                  const st = shiftTypes.find((s) => s.id === a.shiftTypeId);
                                  return (
                                    <tr key={`mine-${a.id}`}>
                                      <td>{formatDateIt(a.date)}</td>
                                      <td>{a.shiftTypeName}</td>
                                      <td>{st ? `${st.startTime} - ${st.endTime}` : "-"}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </>
                      )}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
          <div
            onClick={() => setPreviewOpen(false)}
            style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.06)", zIndex: 1040 }}
          />
        </>
      ) : null}
      {dragging ? (
        <div
          style={{
            position: "fixed",
            right: 14,
            bottom: 14,
            zIndex: 1055,
            background: "#1f7a3f",
            color: "#fff",
            borderRadius: 8,
            padding: "6px 10px",
            fontSize: 12,
            fontWeight: 600,
            pointerEvents: "none",
          }}
        >
          Rilascia sulla cella turno
        </div>
      ) : null}
    </div>
  );
}
