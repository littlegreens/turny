import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { hasAnyRole } from "@/lib/org-roles";
import { authorizeScheduleAccess, canEditScheduleAssignments } from "@/lib/schedule-access";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ scheduleId: string }> };

const holidayModeSchema = z.enum(["CLOSED", "SUNDAY_LIKE", "CUSTOM"]);

const holidayOverrideSchema = z.object({
  id: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  mode: holidayModeSchema,
  shiftTypeIds: z.array(z.string().min(1)).optional(),
});

const patchSchema = z.object({
  holidayOverrides: z.array(holidayOverrideSchema),
});

function isDateInSchedule(date: string, schedule: { year: number; month: number; generationLog: unknown }) {
  const meta = (schedule.generationLog ?? {}) as { startDate?: string; endDate?: string };
  if (meta.startDate && meta.endDate) return date >= meta.startDate && date <= meta.endDate;
  const d = new Date(`${date}T00:00:00.000Z`);
  return d.getUTCFullYear() === schedule.year && d.getUTCMonth() + 1 === schedule.month;
}

export async function PATCH(req: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  const { scheduleId } = await params;
  const access = await authorizeScheduleAccess(scheduleId, session.user.id);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  if (!canEditScheduleAssignments(access.roles, access.schedule.status)) {
    return NextResponse.json({ error: "Permessi insufficienti (solo bozza)" }, { status: 403 });
  }

  // Extra safety: anche ruoli espliciti (OWNER/ADMIN/MANAGER) hanno priorità per UI.
  if (!hasAnyRole(access.roles, ["OWNER", "ADMIN", "MANAGER"])) {
    return NextResponse.json({ error: "Permessi insufficienti" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body non valido" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Input non valido" }, { status: 400 });
  }

  // Validazione minima: date dentro al periodo e shiftTypeIds (se presenti) sono strings valide.
  for (const h of parsed.data.holidayOverrides) {
    if (!isDateInSchedule(h.date, access.schedule)) {
      return NextResponse.json({ error: `Data fuori periodo: ${h.date}` }, { status: 400 });
    }
    // se mode=CLOSED non serve shiftTypeIds; se CUSTOM serve.
    if (h.mode === "CUSTOM" && (!h.shiftTypeIds || h.shiftTypeIds.length === 0)) {
      return NextResponse.json({ error: `Per CUSTOM serve almeno un tipo turno (${h.date})` }, { status: 400 });
    }
  }

  const prevRules = (access.schedule.rules ?? {}) as Record<string, unknown>;
  const nextHolidayOverrides = parsed.data.holidayOverrides.map((r) => ({
    id: r.id,
    date: r.date,
    mode: r.mode,
    ...(r.mode === "CUSTOM" && r.shiftTypeIds?.length ? { shiftTypeIds: r.shiftTypeIds } : {}),
  }));

  await prisma.schedule.update({
    where: { id: scheduleId },
    data: {
      rules: {
        ...prevRules,
        holidayOverrides: nextHolidayOverrides,
      } as unknown as object,
    },
  });

  return NextResponse.json({ ok: true, count: nextHolidayOverrides.length });
}

