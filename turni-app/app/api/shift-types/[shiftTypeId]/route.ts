import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { hasAnyRole, normalizeRoles } from "@/lib/org-roles";
import { prisma } from "@/lib/prisma";

const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;

const updateShiftSchema = z.object({
  name: z.string().trim().min(2).optional(),
  startTime: z.string().regex(timePattern).optional(),
  endTime: z.string().regex(timePattern).optional(),
  minStaff: z.number().int().min(1).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  activeWeekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7).optional(),
  rules: z.any().optional().nullable(),
});

function calcDurationHours(startTime: string, endTime: string) {
  const [startH, startM] = startTime.split(":").map(Number);
  const [endH, endM] = endTime.split(":").map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;
  const durationMinutes =
    endMinutes >= startMinutes ? endMinutes - startMinutes : 24 * 60 - startMinutes + endMinutes;
  return Math.round((durationMinutes / 60) * 100) / 100;
}

type Params = {
  params: Promise<{ shiftTypeId: string }>;
};

export async function PATCH(request: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  const { shiftTypeId } = await params;
  const shiftType = await prisma.shiftType.findUnique({ where: { id: shiftTypeId } });
  if (!shiftType) return NextResponse.json({ error: "Turno non trovato" }, { status: 404 });

  const calendar = await prisma.calendar.findUnique({ where: { id: shiftType.calendarId } });
  if (!calendar) return NextResponse.json({ error: "Calendario non trovato" }, { status: 404 });

  const membership = await prisma.orgMember.findFirst({
    where: { userId: session.user.id, orgId: calendar.orgId },
  });
  const effectiveRoles = membership ? normalizeRoles([membership.role, ...membership.roles]) : [];
  if (!membership || !hasAnyRole(effectiveRoles, ["OWNER", "ADMIN", "MANAGER"])) {
    return NextResponse.json({ error: "Permessi insufficienti" }, { status: 403 });
  }
  const isManagerOnly = hasAnyRole(effectiveRoles, ["MANAGER"]) && !hasAnyRole(effectiveRoles, ["OWNER", "ADMIN"]);
  if (isManagerOnly) {
    const access = await prisma.calendarMember.findUnique({
      where: { calendarId_userId: { calendarId: calendar.id, userId: session.user.id } },
    });
    if (!access) return NextResponse.json({ error: "Permessi insufficienti" }, { status: 403 });
  }

  const parsed = updateShiftSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Input non valido" }, { status: 400 });

  const startTime = parsed.data.startTime ?? shiftType.startTime;
  const endTime = parsed.data.endTime ?? shiftType.endTime;

  const updated = await prisma.shiftType.update({
    where: { id: shiftTypeId },
    data: {
      ...(parsed.data.name ? { name: parsed.data.name } : {}),
      ...(parsed.data.startTime ? { startTime: parsed.data.startTime } : {}),
      ...(parsed.data.endTime ? { endTime: parsed.data.endTime } : {}),
      ...(parsed.data.minStaff !== undefined ? { minStaff: parsed.data.minStaff } : {}),
      ...(parsed.data.color ? { color: parsed.data.color } : {}),
      ...(parsed.data.activeWeekdays ? { activeWeekdays: parsed.data.activeWeekdays } : {}),
      ...(parsed.data.rules !== undefined ? { rules: parsed.data.rules } : {}),
      durationHours: calcDurationHours(startTime, endTime),
    },
  });

  return NextResponse.json({ shiftType: updated });
}

export async function DELETE(_: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  const { shiftTypeId } = await params;
  const shiftType = await prisma.shiftType.findUnique({ where: { id: shiftTypeId } });
  if (!shiftType) return NextResponse.json({ error: "Turno non trovato" }, { status: 404 });

  const calendar = await prisma.calendar.findUnique({ where: { id: shiftType.calendarId } });
  if (!calendar) return NextResponse.json({ error: "Calendario non trovato" }, { status: 404 });

  const membership = await prisma.orgMember.findFirst({
    where: { userId: session.user.id, orgId: calendar.orgId },
  });
  const effectiveRoles = membership ? normalizeRoles([membership.role, ...membership.roles]) : [];
  if (!membership || !hasAnyRole(effectiveRoles, ["OWNER", "ADMIN", "MANAGER"])) {
    return NextResponse.json({ error: "Permessi insufficienti" }, { status: 403 });
  }
  const isManagerOnly = hasAnyRole(effectiveRoles, ["MANAGER"]) && !hasAnyRole(effectiveRoles, ["OWNER", "ADMIN"]);
  if (isManagerOnly) {
    const access = await prisma.calendarMember.findUnique({
      where: { calendarId_userId: { calendarId: calendar.id, userId: session.user.id } },
    });
    if (!access) return NextResponse.json({ error: "Permessi insufficienti" }, { status: 403 });
  }

  await prisma.shiftType.delete({ where: { id: shiftTypeId } });
  return NextResponse.json({ ok: true });
}
