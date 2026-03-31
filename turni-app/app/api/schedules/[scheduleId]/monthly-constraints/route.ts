import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { hasAnyRole } from "@/lib/org-roles";
import { authorizeScheduleAccess } from "@/lib/schedule-access";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const createMonthlyConstraintSchema = z.object({
  memberId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data non valida"),
  note: z.string().trim().max(200).optional().or(z.literal("")),
});

/** Nessun campo `note` lato griglia: evita fallimenti Zod su union/optional. */
const monthlyConstraintItemSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("UNAVAILABLE_DATE"),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data non valida (usa YYYY-MM-DD)"),
  }),
  z.object({
    type: z.literal("UNAVAILABLE_SHIFT"),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data non valida (usa YYYY-MM-DD)"),
    shiftTypeId: z.string().min(1, "Manca il tipo turno per indisponibilità su singolo turno"),
  }),
  z.object({
    type: z.literal("REQUIRED_DATE"),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data non valida (usa YYYY-MM-DD)"),
  }),
  z.object({
    type: z.literal("REQUIRED_SHIFT"),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data non valida (usa YYYY-MM-DD)"),
    shiftTypeId: z.string().min(1, "Manca il tipo turno per obbligo assegnazione"),
  }),
]);

const replaceMonthlyConstraintsSchema = z.object({
  memberId: z.string().min(1),
  items: z.array(monthlyConstraintItemSchema),
});

type Params = {
  params: Promise<{ scheduleId: string }>;
};

function isDateInSchedule(date: string, schedule: { year: number; month: number; generationLog: unknown }) {
  const meta = (schedule.generationLog ?? {}) as { startDate?: string; endDate?: string };
  if (meta.startDate && meta.endDate) return date >= meta.startDate && date <= meta.endDate;
  const d = new Date(`${date}T00:00:00.000Z`);
  return d.getUTCFullYear() === schedule.year && d.getUTCMonth() + 1 === schedule.month;
}

export async function GET(_: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  const { scheduleId } = await params;
  const access = await authorizeScheduleAccess(scheduleId, session.user.id);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const monthlyConstraints = await prisma.monthlyConstraint.findMany({
    where: { scheduleId },
    include: {
      member: {
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      },
    },
    orderBy: [{ createdAt: "desc" }],
  });
  return NextResponse.json({ monthlyConstraints });
}

export async function POST(request: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  const { scheduleId } = await params;
  const access = await authorizeScheduleAccess(scheduleId, session.user.id);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  if (!hasAnyRole(access.roles, ["OWNER", "ADMIN", "MANAGER", "WORKER"])) {
    return NextResponse.json({ error: "Permessi insufficienti" }, { status: 403 });
  }

  const parsed = createMonthlyConstraintSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Input non valido" }, { status: 400 });
  }

  const member = await prisma.calendarMember.findUnique({
    where: { id: parsed.data.memberId },
  });
  if (!member || member.calendarId !== access.schedule.calendarId) {
    return NextResponse.json({ error: "Persona calendario non valida" }, { status: 400 });
  }

  if (!isDateInSchedule(parsed.data.date, access.schedule)) {
    return NextResponse.json({ error: "La data deve rientrare nel periodo del turno" }, { status: 400 });
  }

  const created = await prisma.monthlyConstraint.create({
    data: {
      scheduleId,
      memberId: parsed.data.memberId,
      type: "UNAVAILABLE_DATE",
      weight: "HARD",
      value: { date: parsed.data.date },
      note: parsed.data.note || null,
    },
  });

  return NextResponse.json({ monthlyConstraint: created }, { status: 201 });
}

export async function PUT(request: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  const { scheduleId } = await params;
  const access = await authorizeScheduleAccess(scheduleId, session.user.id);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  if (!hasAnyRole(access.roles, ["OWNER", "ADMIN", "MANAGER", "WORKER"])) {
    return NextResponse.json({ error: "Permessi insufficienti" }, { status: 403 });
  }

  const parsed = replaceMonthlyConstraintsSchema.safeParse(await request.json());
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).filter(Boolean)[0] ?? "Input non valido";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const member = await prisma.calendarMember.findUnique({
    where: { id: parsed.data.memberId },
  });
  if (!member || member.calendarId !== access.schedule.calendarId) {
    return NextResponse.json({ error: "Persona calendario non valida" }, { status: 400 });
  }

  for (const item of parsed.data.items) {
    if (!isDateInSchedule(item.date, access.schedule)) {
      return NextResponse.json({ error: "Una data non rientra nel periodo del turno" }, { status: 400 });
    }
    if (item.type === "UNAVAILABLE_SHIFT" && !item.shiftTypeId) {
      return NextResponse.json({ error: "Per UNAVAILABLE_SHIFT serve shiftTypeId" }, { status: 400 });
    }
    if (item.type === "REQUIRED_SHIFT" && !item.shiftTypeId) {
      return NextResponse.json({ error: "Per REQUIRED_SHIFT serve shiftTypeId" }, { status: 400 });
    }
  }

  const shiftTypes = await prisma.shiftType.findMany({
    where: { calendarId: access.schedule.calendarId, isActive: true },
    select: { id: true, name: true, maxStaff: true },
  });
  const maxStaffByShiftId = new Map(shiftTypes.map((s) => [s.id, s.maxStaff]));
  const nameByShiftId = new Map(shiftTypes.map((s) => [s.id, s.name]));

  const peersMonthlyAll = await prisma.monthlyConstraint.findMany({
    where: { scheduleId, memberId: { not: parsed.data.memberId } },
    select: { memberId: true, type: true, value: true },
  });
  const existingRequiredShift = peersMonthlyAll.filter((r) => String(r.type) === "REQUIRED_SHIFT");

  const deveCountByCell = new Map<string, Set<string>>();
  const addDeve = (memberId: string, date: string, shiftTypeId: string) => {
    const k = `${date}\n${shiftTypeId}`;
    let set = deveCountByCell.get(k);
    if (!set) {
      set = new Set();
      deveCountByCell.set(k, set);
    }
    set.add(memberId);
  };

  for (const row of existingRequiredShift) {
    const v = row.value as { date?: string; shiftTypeId?: string };
    if (!v?.date || !v?.shiftTypeId) continue;
    if (!isDateInSchedule(v.date, access.schedule)) continue;
    addDeve(row.memberId, v.date, v.shiftTypeId);
  }

  for (const item of parsed.data.items) {
    if (item.type !== "REQUIRED_SHIFT") continue;
    addDeve(parsed.data.memberId, item.date, item.shiftTypeId);
  }

  for (const [k, memberSet] of deveCountByCell) {
    const nl = k.indexOf("\n");
    const date = k.slice(0, nl);
    const shiftTypeId = k.slice(nl + 1);
    const cap = maxStaffByShiftId.get(shiftTypeId);
    if (cap == null) continue;
    if (memberSet.size > cap) {
      const shiftName = nameByShiftId.get(shiftTypeId) ?? shiftTypeId;
      return NextResponse.json(
        {
          error: `Per ${date} («${shiftName}») ci sono al massimo ${cap} posti nel turno: ci sono già ${memberSet.size} persone con DEVE su quello stesso slot (non puoi aggiungerne un’altra).`,
        },
        { status: 400 },
      );
    }
  }

  await prisma.$transaction([
    prisma.monthlyConstraint.deleteMany({
      where: { scheduleId, memberId: parsed.data.memberId },
    }),
    prisma.monthlyConstraint.createMany({
      data: parsed.data.items.map((item) => ({
        scheduleId,
        memberId: parsed.data.memberId,
        type: item.type,
        weight: "HARD",
        value:
          item.type === "UNAVAILABLE_DATE" || item.type === "REQUIRED_DATE"
            ? { date: item.date }
            : { date: item.date, shiftTypeId: item.shiftTypeId },
        note: null,
      })) as unknown as Prisma.MonthlyConstraintCreateManyInput[],
    }),
  ]);

  return NextResponse.json({ ok: true, count: parsed.data.items.length });
}
