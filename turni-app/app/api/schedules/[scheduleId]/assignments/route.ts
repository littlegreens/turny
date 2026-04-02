import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { authorizeScheduleAccess, canEditScheduleAssignments } from "@/lib/schedule-access";
import { prisma } from "@/lib/prisma";

const createAssignmentSchema = z
  .object({
    memberId: z.string().min(1).optional(),
    guestLabel: z.string().min(1).max(120).optional(),
    guestColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
    shiftTypeId: z.string().min(1),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data non valida"),
  })
  .refine(
    (d) =>
      Boolean(d.memberId && d.memberId.length > 0) !==
      Boolean(d.guestLabel && d.guestLabel.trim().length > 0),
    { message: "Indica un membro oppure nome e colore per persona extra." },
  );

type Params = {
  params: Promise<{ scheduleId: string }>;
};

export async function POST(request: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  const { scheduleId } = await params;
  const access = await authorizeScheduleAccess(scheduleId, session.user.id);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  if (!canEditScheduleAssignments(access.roles, access.schedule.status)) {
    return NextResponse.json({ error: "Modifica non consentita (solo bozza, ruolo responsabile/manager)" }, { status: 403 });
  }

  const parsed = createAssignmentSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Input non valido" }, { status: 400 });
  }

  const { memberId, guestLabel, guestColor, shiftTypeId, date } = parsed.data;
  const d = new Date(`${date}T00:00:00.000Z`);
  const meta = (access.schedule.generationLog ?? {}) as { startDate?: string; endDate?: string };
  if (meta.startDate && meta.endDate) {
    if (date < meta.startDate || date > meta.endDate) {
      return NextResponse.json({ error: "La data deve rientrare nel periodo del turno" }, { status: 400 });
    }
  } else {
    const year = d.getUTCFullYear();
    const month = d.getUTCMonth() + 1;
    if (year !== access.schedule.year || month !== access.schedule.month) {
      return NextResponse.json({ error: "La data deve appartenere al mese dello schedule" }, { status: 400 });
    }
  }

  const shiftType = await prisma.shiftType.findUnique({ where: { id: shiftTypeId } });

  if (!shiftType || shiftType.calendarId !== access.schedule.calendarId) {
    return NextResponse.json({ error: "Tipo turno non valido" }, { status: 400 });
  }

  const isGuest = !memberId || !memberId.trim();
  if (!isGuest) {
    const member = await prisma.calendarMember.findUnique({ where: { id: memberId } });
    if (!member || member.calendarId !== access.schedule.calendarId) {
      return NextResponse.json({ error: "Persona calendario non valida" }, { status: 400 });
    }
  }

  const guestColorNorm = guestColor?.trim() || "#6b7280";

  try {
    const created = await prisma.shiftAssignment.create({
      data: {
        scheduleId,
        shiftTypeId,
        date: d,
        ...(isGuest
          ? { memberId: null, guestLabel: guestLabel!.trim(), guestColor: guestColorNorm }
          : { memberId, guestLabel: null, guestColor: null }),
      },
      include: {
        member: { include: { user: { select: { firstName: true, lastName: true, email: true } } } },
        shiftType: { select: { id: true, name: true, color: true } },
      },
    });

    const memberLabel = created.member
      ? `${`${created.member.user.firstName} ${created.member.user.lastName}`.trim() || created.member.user.email}`
      : (created.guestLabel ?? "Extra");

    return NextResponse.json(
      {
        assignment: {
          id: created.id,
          memberId: created.memberId ?? undefined,
          isGuest: !created.memberId,
          guestLabel: created.guestLabel ?? undefined,
          guestColor: created.guestColor ?? undefined,
          shiftTypeId: created.shiftTypeId,
          date: created.date.toISOString().slice(0, 10),
          memberLabel,
          shiftTypeName: created.shiftType.name,
          shiftTypeColor: created.shiftType.color,
        },
      },
      { status: 201 },
    );
  } catch (e: unknown) {
    const code = typeof e === "object" && e !== null && "code" in e ? (e as { code: string }).code : "";
    if (code === "P2002") {
      return NextResponse.json({ error: "Assegnazione gia presente per questa cella" }, { status: 409 });
    }
    throw e;
  }
}

export async function DELETE(_: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  const { scheduleId } = await params;
  const access = await authorizeScheduleAccess(scheduleId, session.user.id);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  if (!canEditScheduleAssignments(access.roles, access.schedule.status)) {
    return NextResponse.json({ error: "Svuotamento non consentito" }, { status: 403 });
  }

  const prevRaw = access.schedule.generationLog;
  const nextLog =
    prevRaw != null && typeof prevRaw === "object" && !Array.isArray(prevRaw)
      ? { ...(prevRaw as Record<string, unknown>) }
      : {};
  nextLog.lastSolverAlerts = [];
  delete nextLog.lastAutoGenerateAt;

  await prisma.$transaction([
    prisma.shiftAssignment.deleteMany({ where: { scheduleId } }),
    prisma.schedule.update({
      where: { id: scheduleId },
      data: { generationLog: nextLog as object },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
