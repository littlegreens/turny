import type { Calendar, Schedule } from "@prisma/client";
import { hasAnyRole, normalizeRoles, type OrgRoleValue } from "@/lib/org-roles";
import { prisma } from "@/lib/prisma";

export type ScheduleAccess =
  | { ok: true; schedule: Schedule; calendar: Calendar; roles: OrgRoleValue[] }
  | { ok: false; status: number; error: string };

/** Lettura schedule + controllo membership org e (per manager) assegnazione calendario. */
export async function authorizeScheduleAccess(scheduleId: string, userId: string): Promise<ScheduleAccess> {
  const schedule = await prisma.schedule.findUnique({
    where: { id: scheduleId },
    include: { calendar: true },
  });
  if (!schedule) return { ok: false, status: 404, error: "Schedule non trovato" };

  const membership = await prisma.orgMember.findFirst({
    where: { userId, orgId: schedule.calendar.orgId },
  });
  const roles = membership ? normalizeRoles([membership.role, ...membership.roles]) : [];
  if (!membership || !hasAnyRole(roles, ["OWNER", "ADMIN", "MANAGER", "WORKER"])) {
    return { ok: false, status: 403, error: "Permessi insufficienti" };
  }

  const isManagerOnly = hasAnyRole(roles, ["MANAGER"]) && !hasAnyRole(roles, ["OWNER", "ADMIN"]);
  if (isManagerOnly) {
    const assigned = await prisma.calendarMember.findUnique({
      where: { calendarId_userId: { calendarId: schedule.calendarId, userId } },
    });
    if (!assigned) return { ok: false, status: 403, error: "Permessi insufficienti" };
  }

  return { ok: true, schedule, calendar: schedule.calendar, roles };
}

export function canEditScheduleAssignments(
  roles: OrgRoleValue[],
  scheduleStatus: Schedule["status"],
): boolean {
  if (scheduleStatus !== "DRAFT") return false;
  return hasAnyRole(roles, ["OWNER", "ADMIN", "MANAGER"]);
}
