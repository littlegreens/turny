import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { canManageCalendarRoster } from "@/lib/calendar-membership-access";
import { hasAnyRole, normalizeRoles } from "@/lib/org-roles";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

type Params = {
  params: Promise<{ calendarMemberId: string }>;
};

const patchBodySchema = z
  .object({
    /** Hex colore calendario, oppure `null` per rimuovere l’override e usare impostazioni membro org */
    color: z.union([z.string().regex(/^#[0-9A-Fa-f]{6}$/), z.null()]).optional(),
    /** Giorni di ferie nel periodo turno: riducono il tetto massimo turni (vincolo CUSTOM VACATION_DAYS_PERIOD). */
    vacationDays: z.number().int().min(0).max(366).optional(),
  })
  .refine((d) => d.color !== undefined || d.vacationDays !== undefined, { message: "Nessun campo da aggiornare" });

export async function DELETE(_: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  const { calendarMemberId } = await params;
  const row = await prisma.calendarMember.findUnique({
    where: { id: calendarMemberId },
    include: { calendar: true },
  });
  if (!row) return NextResponse.json({ error: "Associazione non trovata" }, { status: 404 });

  const access = await canManageCalendarRoster(session.user.id, row.calendarId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  try {
    await prisma.calendarMember.delete({ where: { id: calendarMemberId } });
  } catch (e: unknown) {
    const code = typeof e === "object" && e !== null && "code" in e ? (e as { code: string }).code : "";
    if (code === "P2003" || code === "P2014") {
      return NextResponse.json(
        { error: "Impossibile rimuovere: ci sono turni o vincoli collegati a questa persona nel calendario" },
        { status: 409 },
      );
    }
    throw e;
  }

  return NextResponse.json({ ok: true });
}

export async function PATCH(request: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  const { calendarMemberId } = await params;
  const row = await prisma.calendarMember.findUnique({
    where: { id: calendarMemberId },
    include: { calendar: true },
  });
  if (!row) return NextResponse.json({ error: "Associazione non trovata" }, { status: 404 });

  const parsed = patchBodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Richiesta non valida" }, { status: 400 });
  }

  const isSelf = row.userId === session.user.id;
  if (isSelf) {
    const orgMember = await prisma.orgMember.findFirst({
      where: { userId: session.user.id, orgId: row.calendar.orgId },
    });
    if (orgMember) {
      const roles = normalizeRoles([orgMember.role, ...orgMember.roles]);
      if (!hasAnyRole(roles, ["OWNER", "ADMIN", "MANAGER"])) {
        return NextResponse.json(
          { error: "Solo i responsabili possono modificare colore e ferie in calendario." },
          { status: 403 },
        );
      }
    }
  } else {
    const access = await canManageCalendarRoster(session.user.id, row.calendarId);
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  }

  if (parsed.data.color !== undefined) {
    await prisma.constraint.deleteMany({
      where: { memberId: calendarMemberId, type: "CUSTOM", note: "MEMBER_COLOR" },
    });
    if (parsed.data.color !== null) {
      await prisma.constraint.create({
        data: {
          memberId: calendarMemberId,
          type: "CUSTOM",
          weight: "SOFT",
          value: { color: parsed.data.color },
          note: "MEMBER_COLOR",
          createdBy: session.user.id,
        },
      });
    }
  }

  if (parsed.data.vacationDays !== undefined) {
    await prisma.constraint.deleteMany({
      where: { memberId: calendarMemberId, type: "CUSTOM", note: "VACATION_DAYS_PERIOD" },
    });
    if (parsed.data.vacationDays > 0) {
      await prisma.constraint.create({
        data: {
          memberId: calendarMemberId,
          type: "CUSTOM",
          weight: "SOFT",
          value: { days: parsed.data.vacationDays },
          note: "VACATION_DAYS_PERIOD",
          createdBy: session.user.id,
        },
      });
    }
  }

  return NextResponse.json({ ok: true });
}
