import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { hasAnyRole, normalizeRoles } from "@/lib/org-roles";
import { prisma } from "@/lib/prisma";

const createScheduleSchema = z.object({
  periodType: z.enum(["MONTHLY", "WEEKLY", "CUSTOM"]).default("MONTHLY"),
  turnName: z.string().trim().min(2, "Nome turno troppo corto").max(120, "Nome turno troppo lungo"),
  year: z.number().int().min(2000).max(2100).optional(),
  month: z.number().int().min(1).max(12).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inizio non valida").optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data fine non valida").optional(),
});

type Params = {
  params: Promise<{ calId: string }>;
};

async function canAccessCalendar(userId: string, calId: string) {
  const calendar = await prisma.calendar.findUnique({ where: { id: calId } });
  if (!calendar) return { ok: false as const, status: 404, error: "Calendario non trovato" };

  const membership = await prisma.orgMember.findFirst({
    where: { userId, orgId: calendar.orgId },
  });
  if (!membership) return { ok: false as const, status: 403, error: "Accesso negato" };

  const roles = normalizeRoles([membership.role, ...membership.roles]);
  const isManagerOnly = hasAnyRole(roles, ["MANAGER"]) && !hasAnyRole(roles, ["OWNER", "ADMIN"]);
  if (isManagerOnly) {
    const assigned = await prisma.calendarMember.findUnique({
      where: { calendarId_userId: { calendarId: calId, userId } },
    });
    if (!assigned) return { ok: false as const, status: 403, error: "Accesso negato" };
  }

  return { ok: true as const, calendar, roles };
}

export async function GET(_: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const { calId } = await params;
  const access = await canAccessCalendar(session.user.id, calId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const schedules = await prisma.schedule.findMany({
    where: { calendarId: calId },
    orderBy: [{ year: "desc" }, { month: "desc" }, { createdAt: "desc" }],
  });
  return NextResponse.json({ schedules });
}

export async function POST(request: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const { calId } = await params;
  const access = await canAccessCalendar(session.user.id, calId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  if (!hasAnyRole(access.roles, ["OWNER", "ADMIN", "MANAGER"])) {
    return NextResponse.json({ error: "Permessi insufficienti" }, { status: 403 });
  }

  const parsed = createScheduleSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Input non valido" }, { status: 400 });
  }

  const now = new Date();
  const periodType = parsed.data.periodType;
  let year = parsed.data.year ?? now.getFullYear();
  let month = parsed.data.month ?? now.getMonth() + 1;
  let startDate = parsed.data.startDate ?? "";
  let endDate = parsed.data.endDate ?? "";

  if (periodType === "MONTHLY") {
    if (!parsed.data.year || !parsed.data.month) {
      return NextResponse.json({ error: "Per il mensile servono anno e mese" }, { status: 400 });
    }
    year = parsed.data.year;
    month = parsed.data.month;
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 0));
    startDate = start.toISOString().slice(0, 10);
    endDate = end.toISOString().slice(0, 10);
  } else {
    if (!parsed.data.startDate) {
      return NextResponse.json({ error: "Per settimanale/custom serve la data inizio" }, { status: 400 });
    }
    if (periodType === "WEEKLY" && !parsed.data.endDate) {
      const d = new Date(`${parsed.data.startDate}T00:00:00.000Z`);
      d.setUTCDate(d.getUTCDate() + 6);
      endDate = d.toISOString().slice(0, 10);
    } else if (!parsed.data.endDate) {
      return NextResponse.json({ error: "Per custom serve anche la data fine" }, { status: 400 });
    }
    if (endDate < parsed.data.startDate) {
      return NextResponse.json({ error: "La data fine deve essere >= data inizio" }, { status: 400 });
    }
    startDate = parsed.data.startDate;
    const start = new Date(`${startDate}T00:00:00.000Z`);
    year = start.getUTCFullYear();
    month = start.getUTCMonth() + 1;
  }

  const exists = await prisma.schedule.findUnique({
    where: {
      calendarId_year_month: {
        calendarId: calId,
        year,
        month,
      },
    },
  });
  if (exists) {
    return NextResponse.json({ error: "Schedule del mese gia esistente" }, { status: 409 });
  }

  const schedule = await prisma.schedule.create({
    data: {
      calendarId: calId,
      year,
      month,
      status: "DRAFT",
      generationLog: {
        periodType,
        turnName: parsed.data.turnName,
        startDate,
        endDate,
      },
    },
  });
  return NextResponse.json({ schedule }, { status: 201 });
}
