/**
 * Composizione ruoli per fascia (es. mattina: 1 PS + 1 degenza).
 * Configurata in `shiftType.rules.roleSlots` (allineato a Slot 1…n in UI calendario).
 */

import { parseProfessionalRoles } from "./professional-roles";

export type RoleCoverageEntry = {
  role: string;
  memberIds: string[];
  minCount: number;
};

/** Slot ruolo per persona richiesta (null = indifferente). */
export function roleSlotsForShiftType(minStaff: number, rules: unknown): (string | null)[] {
  const r = rules as { roleSlots?: unknown } | null | undefined;
  const rawSlots = Array.isArray(r?.roleSlots) ? (r!.roleSlots as unknown[]) : [];
  return Array.from({ length: Math.max(1, minStaff) }, (_, i) => {
    const v = rawSlots[i];
    return typeof v === "string" && v.trim() ? v.trim() : null;
  });
}

/** Hard se ogni slot ha un ruolo esplicito (nessun «Indifferente»). */
export function isRoleCompositionHard(slots: (string | null)[]): boolean {
  return slots.length > 0 && slots.every((s) => Boolean(s && s.trim()));
}

export function requiredRoleCounts(slots: (string | null)[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const role of slots) {
    if (!role) continue;
    const key = role.toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/** Token principale di uno slot ruolo (es. «medico degenza» → «degenza»). */
export function primaryRoleToken(slotRoleLower: string): string {
  const parts = slotRoleLower.split(/\s+/).filter(Boolean);
  return parts[parts.length - 1] ?? slotRoleLower;
}

/**
 * Trova i membri idonei per uno slot ruolo.
 * 1) match esatto (case-insensitive)
 * 2) token finale (es. slot «medico degenza» ↔ anagrafica «degenza»)
 * 3) sottostringa ruolo anagrafica nel label slot (≥3 caratteri)
 */
export function resolveMemberIdsForSlotRole(
  slotRoleLower: string,
  roleToMemberIds: Map<string, string[]>,
): string[] {
  const key = slotRoleLower.trim().toLowerCase();
  if (!key) return [];

  const exact = roleToMemberIds.get(key);
  if (exact?.length) return [...exact];

  const ids = new Set<string>();
  const anchor = primaryRoleToken(key);
  if (anchor.length >= 2) {
    for (const id of roleToMemberIds.get(anchor) ?? []) ids.add(id);
  }
  if (ids.size) return [...ids];

  for (const [memberRoleKey, memberIds] of roleToMemberIds) {
    if (memberRoleKey.length >= 3 && key.includes(memberRoleKey)) {
      for (const id of memberIds) ids.add(id);
    }
  }
  return [...ids];
}

/** Persona compatibile con uno slot ruolo (stessa logica di resolveMemberIdsForSlotRole). */
export function memberMatchesSlotRole(professionalRole: string | null | undefined, slotRoleLower: string): boolean {
  const key = slotRoleLower.trim().toLowerCase();
  if (!key) return false;
  const roles = parseProfessionalRoles(professionalRole).map((r) => r.toLowerCase());
  if (roles.some((r) => r === key)) return true;
  const anchor = primaryRoleToken(key);
  if (anchor.length >= 2 && roles.some((r) => r === anchor)) return true;
  return roles.some((r) => r.length >= 3 && key.includes(r));
}

export function memberHasProfessionalRole(professionalRole: string | null | undefined, roleLower: string): boolean {
  return memberMatchesSlotRole(professionalRole, roleLower);
}

export function roleCoverageFromSlots(
  slots: (string | null)[],
  roleToMemberIds: Map<string, string[]>,
): RoleCoverageEntry[] | null {
  const counts = requiredRoleCounts(slots);
  if (counts.size === 0) return null;
  const out = [...counts.entries()]
    .map(([roleLower, minCount]) => ({
      role: roleLower,
      memberIds: resolveMemberIdsForSlotRole(roleLower, roleToMemberIds),
      minCount,
    }))
    .filter((x) => x.minCount > 0);
  return out.length ? out : null;
}

export type RoleCompositionCellIssue = {
  key: string;
  dateStr: string;
  shiftTypeId: string;
  shiftName: string;
  message: string;
};

type AssignmentLike = {
  memberId?: string;
  isGuest?: boolean;
  /** Ruolo anagrafico dell'extra (da registro turno), per validazione composizione. */
  guestProfessionalRole?: string | null;
};

type MemberLike = {
  id: string;
  professionalRole?: string | null;
};

/** Verifica composizione su una cella giorno×fascia. */
export function roleCompositionIssuesForCell(input: {
  dateStr: string;
  shiftTypeId: string;
  shiftName: string;
  minStaff: number;
  rules: unknown;
  assignments: AssignmentLike[];
  membersById: Map<string, MemberLike>;
}): RoleCompositionCellIssue | null {
  const slots = roleSlotsForShiftType(input.minStaff, input.rules);
  if (!isRoleCompositionHard(slots)) return null;

  const required = requiredRoleCounts(slots);
  const key = `${input.dateStr}|${input.shiftTypeId}`;
  const cell = input.assignments;

  const guestsWithoutRole = cell.filter((a) => {
    if (!a.isGuest && a.memberId) return false;
    return parseProfessionalRoles(a.guestProfessionalRole).length === 0;
  });
  if (guestsWithoutRole.length > 0) {
    const label = [...required.keys()].join(" + ");
    return {
      key,
      dateStr: input.dateStr,
      shiftTypeId: input.shiftTypeId,
      shiftName: input.shiftName,
      message: `Composizione richiesta (${label}): persona extra senza ruolo configurato.`,
    };
  }

  /** Ogni assegnazione riempie al più uno slot (ordine Slot 1…n); PS+degenza sulla stessa persona = 1 posto. */
  const remaining = new Map(required);
  const have = new Map<string, number>();
  for (const k of required.keys()) have.set(k, 0);

  const orderedSlotRoles = slots
    .filter((s): s is string => Boolean(s && s.trim()))
    .map((s) => s.toLowerCase());

  for (const a of cell) {
    let professionalRole: string | null | undefined;
    if (a.isGuest || !a.memberId) {
      professionalRole = a.guestProfessionalRole;
    } else {
      professionalRole = input.membersById.get(a.memberId ?? "")?.professionalRole;
    }
    if (!professionalRole?.trim()) continue;
    for (const slotRole of orderedSlotRoles) {
      if ((remaining.get(slotRole) ?? 0) <= 0) continue;
      if (!memberMatchesSlotRole(professionalRole, slotRole)) continue;
      remaining.set(slotRole, (remaining.get(slotRole) ?? 0) - 1);
      have.set(slotRole, (have.get(slotRole) ?? 0) + 1);
      break;
    }
  }

  const missing: string[] = [];
  for (const [role, need] of required) {
    const got = have.get(role) ?? 0;
    if (got < need) missing.push(`${need - got}× ${role}`);
  }

  if (missing.length === 0 && cell.length >= input.minStaff) return null;
  if (missing.length === 0 && cell.length < input.minStaff) {
    missing.push(`${input.minStaff - cell.length}× posto`);
  }
  if (missing.length === 0) return null;

  const requiredLabel = [...required.entries()].map(([r, n]) => `${n}× ${r}`).join(" + ");
  const assignedLabel =
    cell.length === 0
      ? "nessuno assegnato"
      : [...have.entries()].map(([r, n]) => `${n}× ${r}`).join(", ") || "ruoli non compatibili";

  return {
    key,
    dateStr: input.dateStr,
    shiftTypeId: input.shiftTypeId,
    shiftName: input.shiftName,
    message: `Composizione errata (${input.shiftName}): servono ${requiredLabel}; attuale: ${assignedLabel}${missing.length ? ` (manca ${missing.join(", ")})` : ""}.`,
  };
}

export function scanRoleCompositionIssues(input: {
  dates: string[];
  shiftTypes: Array<{
    id: string;
    name: string;
    minStaff: number;
    activeWeekdays: number[];
    rules?: unknown;
  }>;
  isShiftActive: (dateStr: string, st: { id: string; activeWeekdays: number[] }) => boolean;
  assignments: Array<AssignmentLike & { date: string; shiftTypeId: string }>;
  membersById: Map<string, MemberLike>;
}): { keys: Set<string>; rows: RoleCompositionCellIssue[] } {
  const keys = new Set<string>();
  const rows: RoleCompositionCellIssue[] = [];
  const byCell = new Map<string, Array<AssignmentLike & { date: string; shiftTypeId: string }>>();
  for (const a of input.assignments) {
    const k = `${a.date}|${a.shiftTypeId}`;
    const list = byCell.get(k) ?? [];
    list.push(a);
    byCell.set(k, list);
  }

  for (const dateStr of input.dates) {
    for (const st of input.shiftTypes) {
      if (!input.isShiftActive(dateStr, st)) continue;
      const cellKey = `${dateStr}|${st.id}`;
      const issue = roleCompositionIssuesForCell({
        dateStr,
        shiftTypeId: st.id,
        shiftName: st.name,
        minStaff: st.minStaff,
        rules: st.rules,
        assignments: byCell.get(cellKey) ?? [],
        membersById: input.membersById,
      });
      if (!issue) continue;
      keys.add(cellKey);
      rows.push(issue);
    }
  }

  rows.sort((a, b) => `${a.dateStr}|${a.shiftName}`.localeCompare(`${b.dateStr}|${b.shiftName}`, "it"));
  return { keys, rows };
}

/** Avvisi configurazione: slot ruolo senza nessuna persona idonea in anagrafica. */
export function roleCompositionSetupWarnings(
  shiftTypes: Array<{ name: string; minStaff: number; rules?: unknown }>,
  roleToMemberIds: Map<string, string[]>,
): string[] {
  const warnings: string[] = [];
  for (const st of shiftTypes) {
    const slots = roleSlotsForShiftType(st.minStaff, st.rules);
    if (!isRoleCompositionHard(slots)) continue;
    for (const [roleLower] of requiredRoleCounts(slots)) {
      if (resolveMemberIdsForSlotRole(roleLower, roleToMemberIds).length) continue;
      warnings.push(
        `Fascia «${st.name}»: slot «${roleLower}» non ha persone in anagrafica (etichetta ruolo non trovata nel team).`,
      );
    }
  }
  return warnings;
}
