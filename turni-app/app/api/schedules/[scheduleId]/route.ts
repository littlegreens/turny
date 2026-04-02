import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { hasAnyRole, normalizeRoles } from "@/lib/org-roles";
import { prisma } from "@/lib/prisma";

const isoDate = z
  .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal("")])
  .optional()
  .transform((v) => (v === "" ? undefined : v));

const updateScheduleSchema = z.object({
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional(),
  periodType: z.enum(["MONTHLY", "WEEKLY", "CUSTOM"]).optional(),
  turnName: z.string().trim().min(2, "Nome turno troppo corto").max(120, "Nome turno troppo lungo").optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  startDate: isoDate,
  endDate: isoDate,
});

type Params = {
  params: Promise<{ scheduleId: string }>;
};

export async function PATCH(request: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  const { scheduleId } = await params;
  const schedule = await prisma.schedule.findUnique({ where: { id: scheduleId } });
  if (!schedule) return NextResponse.json({ error: "Schedule non trovato" }, { status: 404 });

  const calendar = await prisma.calendar.findUnique({ where: { id: schedule.calendarId } });
  if (!calendar) return NextResponse.json({ error: "Calendario non trovato" }, { status: 404 });

  const membership = await prisma.orgMember.findFirst({
    where: { userId: session.user.id, orgId: calendar.orgId },
  });
  const roles = membership ? normalizeRoles([membership.role, ...membership.roles]) : [];
  if (!membership || !hasAnyRole(roles, ["OWNER", "ADMIN", "MANAGER"])) {
    return NextResponse.json({ error: "Permessi insufficienti" }, { status: 403 });
  }

  const isManagerOnly = hasAnyRole(roles, ["MANAGER"]) && !hasAnyRole(roles, ["OWNER", "ADMIN"]);
  if (isManagerOnly) {
    const assigned = await prisma.calendarMember.findUnique({
      where: { calendarId_userId: { calendarId: calendar.id, userId: session.user.id } },
    });
    if (!assigned) return NextResponse.json({ error: "Permessi insufficienti" }, { status: 403 });
  }

  const parsed = updateScheduleSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Input non valido" }, { status: 400 });

  const currentMeta = (schedule.generationLog ?? {}) as { periodType?: string; startDate?: string; endDate?: string };
  const nextPeriodType = parsed.data.periodType ?? (currentMeta.periodType as "MONTHLY" | "WEEKLY" | "CUSTOM" | undefined) ?? "MONTHLY";
  let nextYear = parsed.data.year ?? schedule.year;
  let nextMonth = parsed.data.month ?? schedule.month;
  let nextStartDate = parsed.data.startDate ?? currentMeta.startDate ?? "";
  let nextEndDate = parsed.data.endDate ?? currentMeta.endDate ?? "";

  if (nextPeriodType === "MONTHLY") {
    if (!parsed.data.year || !parsed.data.month) {
      nextYear = schedule.year;
      nextMonth = schedule.month;
    } else {
      nextYear = parsed.data.year;
      nextMonth = parsed.data.month;
    }
    const start = new Date(Date.UTC(nextYear, nextMonth - 1, 1));
    const end = new Date(Date.UTC(nextYear, nextMonth, 0));
    nextStartDate = start.toISOString().slice(0, 10);
    nextEndDate = end.toISOString().slice(0, 10);
  } else {
    if (nextPeriodType === "WEEKLY" && nextStartDate && !parsed.data.endDate) {
      const d = new Date(`${nextStartDate}T00:00:00.000Z`);
      d.setUTCDate(d.getUTCDate() + 6);
      nextEndDate = d.toISOString().slice(0, 10);
    }
    if (!nextStartDate || !nextEndDate) {
      return NextResponse.json({ error: "Per periodo settimanale/custom servono date inizio/fine" }, { status: 400 });
    }
    if (nextEndDate < nextStartDate) {
      return NextResponse.json({ error: "Data fine non valida" }, { status: 400 });
    }
    const d = new Date(`${nextStartDate}T00:00:00.000Z`);
    nextYear = d.getUTCFullYear();
    nextMonth = d.getUTCMonth() + 1;
  }

  const updated = await prisma.schedule.update({
    where: { id: scheduleId },
    data: {
      year: nextYear,
      month: nextMonth,
      ...(parsed.data.status ? { status: parsed.data.status } : {}),
      ...(parsed.data.status === "PUBLISHED" ? { publishedAt: new Date(), publishedBy: session.user.id } : {}),
      ...(parsed.data.status === "DRAFT" ? { publishedAt: null, publishedBy: null } : {}),
      generationLog: {
        ...(currentMeta ?? {}),
        ...(parsed.data.turnName ? { turnName: parsed.data.turnName } : {}),
        periodType: nextPeriodType,
        startDate: nextStartDate,
        endDate: nextEndDate,
      },
    },
  });
  return NextResponse.json({ schedule: updated });
}

export async function DELETE(_: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  const { scheduleId } = await params;
  const schedule = await prisma.schedule.findUnique({ where: { id: scheduleId } });
  if (!schedule) return NextResponse.json({ error: "Schedule non trovato" }, { status: 404 });

  const calendar = await prisma.calendar.findUnique({ where: { id: schedule.calendarId } });
  if (!calendar) return NextResponse.json({ error: "Calendario non trovato" }, { status: 404 });

  const membership = await prisma.orgMember.findFirst({
    where: { userId: session.user.id, orgId: calendar.orgId },
  });
  const roles = membership ? normalizeRoles([membership.role, ...membership.roles]) : [];
  if (!membership || !hasAnyRole(roles, ["OWNER", "ADMIN", "MANAGER"])) {
    return NextResponse.json({ error: "Permessi insufficienti" }, { status: 403 });
  }

  const isManagerOnly = hasAnyRole(roles, ["MANAGER"]) && !hasAnyRole(roles, ["OWNER", "ADMIN"]);
  if (isManagerOnly) {
    const assigned = await prisma.calendarMember.findUnique({
      where: { calendarId_userId: { calendarId: calendar.id, userId: session.user.id } },
    });
    if (!assigned) return NextResponse.json({ error: "Permessi insufficienti" }, { status: 403 });
  }

  await prisma.schedule.delete({ where: { id: scheduleId } });
  return NextResponse.json({ ok: true });
}
