import { hasAnyRole, normalizeRoles } from "@/lib/org-roles";
import { prisma } from "@/lib/prisma";

/**
 * Verifica se l'utente puo gestire i membri di un calendario (aggiungere/rimuovere persone).
 * OWNER/ADMIN: sempre. MANAGER: solo se assegnato al calendario.
 */
export async function canManageCalendarRoster(userId: string, calendarId: string) {
  const calendar = await prisma.calendar.findUnique({ where: { id: calendarId } });
  if (!calendar) return { ok: false as const, status: 404, error: "Calendario non trovato" };

  const membership = await prisma.orgMember.findFirst({
    where: { userId, orgId: calendar.orgId },
  });
  const roles = membership ? normalizeRoles([membership.role, ...membership.roles]) : [];
  if (!membership || !hasAnyRole(roles, ["OWNER", "ADMIN", "MANAGER"])) {
    return { ok: false as const, status: 403, error: "Permessi insufficienti" };
  }

  const isManagerOnly = hasAnyRole(roles, ["MANAGER"]) && !hasAnyRole(roles, ["OWNER", "ADMIN"]);
  if (isManagerOnly) {
    const assigned = await prisma.calendarMember.findUnique({
      where: { calendarId_userId: { calendarId, userId } },
    });
    if (!assigned) return { ok: false as const, status: 403, error: "Permessi insufficienti" };
  }

  return { ok: true as const, calendar, roles };
}
