import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { hasAnyRole, normalizeRoles } from "@/lib/org-roles";
import { prisma } from "@/lib/prisma";

type Params = {
  params: Promise<{ constraintId: string }>;
};

export async function DELETE(_: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  const { constraintId } = await params;
  const item = await prisma.monthlyConstraint.findUnique({
    where: { id: constraintId },
    include: { schedule: { include: { calendar: true } } },
  });
  if (!item) return NextResponse.json({ error: "Vincolo non trovato" }, { status: 404 });

  const membership = await prisma.orgMember.findFirst({
    where: { userId: session.user.id, orgId: item.schedule.calendar.orgId },
  });
  const roles = membership ? normalizeRoles([membership.role, ...membership.roles]) : [];
  if (!membership || !hasAnyRole(roles, ["OWNER", "ADMIN", "MANAGER", "WORKER"])) {
    return NextResponse.json({ error: "Permessi insufficienti" }, { status: 403 });
  }

  const isManagerOnly = hasAnyRole(roles, ["MANAGER"]) && !hasAnyRole(roles, ["OWNER", "ADMIN"]);
  if (isManagerOnly) {
    const assigned = await prisma.calendarMember.findUnique({
      where: { calendarId_userId: { calendarId: item.schedule.calendarId, userId: session.user.id } },
    });
    if (!assigned) return NextResponse.json({ error: "Permessi insufficienti" }, { status: 403 });
  }

  await prisma.monthlyConstraint.delete({ where: { id: constraintId } });
  return NextResponse.json({ ok: true });
}
