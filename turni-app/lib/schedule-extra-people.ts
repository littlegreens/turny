/**
 * Persone extra registrate nel turno (tappabuchi, non in anagrafica).
 * Persistite in `schedule.rules.extraPeople`.
 */

export type ScheduleExtraPerson = {
  id: string;
  label: string;
  color: string;
  professionalRole: string;
};

export const EXTRA_PERSON_NOTE_PREFIX = "extraPersonId:";

export function extraPersonAssignmentNote(id: string): string {
  return `${EXTRA_PERSON_NOTE_PREFIX}${id}`;
}

export function parseExtraPersonIdFromNote(note: string | null | undefined): string | null {
  const n = (note ?? "").trim();
  if (!n.startsWith(EXTRA_PERSON_NOTE_PREFIX)) return null;
  const id = n.slice(EXTRA_PERSON_NOTE_PREFIX.length).trim();
  return id || null;
}

export function parseScheduleExtraPeople(rules: unknown): ScheduleExtraPerson[] {
  const r = rules as { extraPeople?: unknown } | null | undefined;
  if (!Array.isArray(r?.extraPeople)) return [];
  const out: ScheduleExtraPerson[] = [];
  for (const item of r.extraPeople) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id.trim() : "";
    const label = typeof o.label === "string" ? o.label.trim() : "";
    const color = typeof o.color === "string" ? o.color.trim() : "#6b7280";
    const professionalRole = typeof o.professionalRole === "string" ? o.professionalRole.trim() : "";
    if (!id || !label) continue;
    if (!/^#[0-9A-Fa-f]{6}$/.test(color)) continue;
    out.push({ id, label, color, professionalRole });
  }
  return out;
}

export function extraPersonById(
  people: ScheduleExtraPerson[],
  id: string | null | undefined,
): ScheduleExtraPerson | undefined {
  if (!id) return undefined;
  return people.find((p) => p.id === id);
}
