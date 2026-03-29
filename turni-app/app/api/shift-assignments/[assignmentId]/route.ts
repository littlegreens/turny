import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { authorizeScheduleAccess, canEditScheduleAssignments } from "@/lib/schedule-access";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

type Params = {
  params: Promise<{ assignmentId: string }>;
};

const moveAssignmentSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  shiftTypeId: z.string().min(1),
});

export async function DELETE(_: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  const { assignmentId } = await params;
  const assignment = await prisma.shiftAssignment.findUnique({
    where: { id: assignmentId },
    include: { schedule: true },
  });
  if (!assignment) return NextResponse.json({ error: "Assegnazione non trovata" }, { status: 404 });

  const access = await authorizeScheduleAccess(assignment.scheduleId, session.user.id);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  if (!canEditScheduleAssignments(access.roles, assignment.schedule.status)) {
    return NextResponse.json({ error: "Eliminazione non consentita" }, { status: 403 });
  }

  await prisma.shiftAssignment.delete({ where: { id: assignmentId } });
  return NextResponse.json({ ok: true });
}

export async function PATCH(request: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  const { assignmentId } = await params;
  const assignment = await prisma.shiftAssignment.findUnique({
    where: { id: assignmentId },
    include: { schedule: true },
  });
  if (!assignment) return NextResponse.json({ error: "Assegnazione non trovata" }, { status: 404 });

  const access = await authorizeScheduleAccess(assignment.scheduleId, session.user.id);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  if (!canEditScheduleAssignments(access.roles, assignment.schedule.status)) {
    return NextResponse.json({ error: "Modifica non consentita" }, { status: 403 });
  }

  const parsed = moveAssignmentSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Input non valido" }, { status: 400 });

  const meta = (assignment.schedule.generationLog ?? {}) as { startDate?: string; endDate?: string };
  if (meta.startDate && meta.endDate) {
    if (parsed.data.date < meta.startDate || parsed.data.date > meta.endDate) {
      return NextResponse.json({ error: "Data fuori periodo turno" }, { status: 400 });
    }
  }

  const d = new Date(`${parsed.data.date}T00:00:00.000Z`);
  try {
    const updated = await prisma.shiftAssignment.update({
      where: { id: assignmentId },
      data: { date: d, shiftTypeId: parsed.data.shiftTypeId },
    });
    return NextResponse.json({ assignment: updated });
  } catch (e: unknown) {
    const code = typeof e === "object" && e !== null && "code" in e ? (e as { code: string }).code : "";
    if (code === "P2002") return NextResponse.json({ error: "Assegnazione gia presente in destinazione" }, { status: 409 });
    throw e;
  }
}
