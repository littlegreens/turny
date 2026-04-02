import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { hasAnyRole, normalizeRoles } from "@/lib/org-roles";
import { prisma } from "@/lib/prisma";

const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;

const createShiftTypeSchema = z.object({
  name: z.string().trim().min(2, "Nome turno troppo corto"),
  startTime: z.string().regex(timePattern, "Orario inizio non valido"),
  endTime: z.string().regex(timePattern, "Orario fine non valido"),
  minStaff: z.number().int().min(1, "minStaff deve essere almeno 1"),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Colore non valido").default("#E1F5EE"),
  activeWeekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7).optional(),
  rules: z.any().optional().nullable(),
});

function calcDurationHours(startTime: string, endTime: string) {
  const [startH, startM] = startTime.split(":").map(Number);
  const [endH, endM] = endTime.split(":").map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;
  const durationMinutes =
    endMinutes >= startMinutes
      ? endMinutes - startMinutes
      : 24 * 60 - startMinutes + endMinutes;

  return Math.round((durationMinutes / 60) * 100) / 100;
}

type Params = {
  params: Promise<{ calId: string }>;
};

export async function GET(_: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const { calId } = await params;

  const calendar = await prisma.calendar.findUnique({
    where: { id: calId },
    include: { org: true },
  });
  if (!calendar) {
    return NextResponse.json({ error: "Calendario non trovato" }, { status: 404 });
  }

  const membership = await prisma.orgMember.findFirst({
    where: { userId: session.user.id, orgId: calendar.orgId },
  });
  if (!membership) {
    return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
  }
  const effectiveRoles = normalizeRoles([membership.role, ...membership.roles]);
  const isManagerOnly = hasAnyRole(effectiveRoles, ["MANAGER"]) && !hasAnyRole(effectiveRoles, ["OWNER", "ADMIN"]);
  if (isManagerOnly) {
    const access = await prisma.calendarMember.findUnique({
      where: { calendarId_userId: { calendarId: calendar.id, userId: session.user.id } },
    });
    if (!access) return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
  }

  const shiftTypes = await prisma.shiftType.findMany({
    where: { calendarId: calId },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });

  return NextResponse.json({ shiftTypes });
}

export async function POST(request: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const { calId } = await params;

  const calendar = await prisma.calendar.findUnique({
    where: { id: calId },
  });
  if (!calendar) {
    return NextResponse.json({ error: "Calendario non trovato" }, { status: 404 });
  }

  const membership = await prisma.orgMember.findFirst({
    where: { userId: session.user.id, orgId: calendar.orgId },
  });
  if (!membership) {
    return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
  }
  const effectiveRoles = normalizeRoles([membership.role, ...membership.roles]);
  if (!hasAnyRole(effectiveRoles, ["OWNER", "ADMIN", "MANAGER"])) {
    return NextResponse.json({ error: "Permessi insufficienti" }, { status: 403 });
  }
  const isManagerOnly = hasAnyRole(effectiveRoles, ["MANAGER"]) && !hasAnyRole(effectiveRoles, ["OWNER", "ADMIN"]);
  if (isManagerOnly) {
    const access = await prisma.calendarMember.findUnique({
      where: { calendarId_userId: { calendarId: calendar.id, userId: session.user.id } },
    });
    if (!access) return NextResponse.json({ error: "Permessi insufficienti" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = createShiftTypeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Input non valido" },
      { status: 400 },
    );
  }

  const nextOrder = await prisma.shiftType.count({
    where: { calendarId: calId },
  });

  const shiftType = await prisma.shiftType.create({
    data: {
      calendarId: calId,
      name: parsed.data.name,
      startTime: parsed.data.startTime,
      endTime: parsed.data.endTime,
      durationHours: calcDurationHours(parsed.data.startTime, parsed.data.endTime),
      minStaff: parsed.data.minStaff,
      color: parsed.data.color,
      order: nextOrder,
      activeWeekdays: parsed.data.activeWeekdays ?? calendar.activeWeekdays,
      ...(parsed.data.rules !== undefined ? { rules: parsed.data.rules } : {}),
    },
  });

  return NextResponse.json({ shiftType }, { status: 201 });
}
