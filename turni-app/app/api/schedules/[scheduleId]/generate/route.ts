import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { callSchedulerSolve, type RemoteSolveResult } from "@/lib/scheduler-remote";
import { authorizeScheduleAccess, canEditScheduleAssignments } from "@/lib/schedule-access";
import { prisma } from "@/lib/prisma";
import { buildInfeasibilityHints } from "@/lib/infeasibility-hints";
import {
  buildSchedulerProblem,
  datesInMonth,
  datesInRange,
  effectiveMaxShiftsMonthFromConstraints,
  type SchedulerFixedAssignment,
} from "@/lib/scheduler-problem";

type Params = {
  params: Promise<{ scheduleId: string }>;
};

export async function POST(_: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  const { scheduleId } = await params;
  const access = await authorizeScheduleAccess(scheduleId, session.user.id);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  if (!canEditScheduleAssignments(access.roles, access.schedule.status)) {
    return NextResponse.json({ error: "Generazione consentita solo in bozza" }, { status: 403 });
  }

  const meta = (access.schedule.generationLog ?? {}) as { startDate?: string; endDate?: string };
  const dates =
    meta.startDate && meta.endDate ? datesInRange(meta.startDate, meta.endDate) : datesInMonth(access.schedule.year, access.schedule.month);

  const constraintTypesIn = [
    "UNAVAILABLE_SHIFT",
    "UNAVAILABLE_WEEKDAY",
    "UNAVAILABLE_DATE",
    "UNAVAILABLE_DATES",
    "UNAVAILABLE_DATERANGE",
    "MAX_SHIFTS_MONTH",
    "NO_WEEKEND",
    "MAX_CONSECUTIVE_DAYS",
  ] as const;

  const customSchedulerNotes = [
    "TARGET_SHIFTS_MONTH",
    "TARGET_SHIFTS_WEEK",
    "TARGET_NIGHTS_MONTH",
    "TARGET_SATURDAYS_MONTH",
    "TARGET_SUNDAYS_MONTH",
    "VACATION_DAYS_PERIOD",
  ] as const;

  const [calendar, shiftTypes, members, existingAssignments, monthlyConstraintsRaw, memberConstraints] = await Promise.all([
    prisma.calendar.findUnique({
      where: { id: access.schedule.calendarId },
      select: { timezone: true, rules: true },
    }),
    prisma.shiftType.findMany({
      where: { calendarId: access.schedule.calendarId, isActive: true },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        name: true,
        minStaff: true,
        maxStaff: true,
        activeWeekdays: true,
        startTime: true,
        endTime: true,
        durationHours: true,
        rules: true,
      },
    }),
    prisma.calendarMember.findMany({
      where: { calendarId: access.schedule.calendarId, isActive: true },
      select: {
        id: true,
        isJolly: true,
        maxConsecutiveDays: true,
        minRestHoursBetweenShifts: true,
        contractShiftsMonth: true,
        user: { select: { firstName: true, lastName: true, email: true, professionalRole: true } },
      },
    }),
    prisma.shiftAssignment.findMany({
      where: { scheduleId },
      select: { memberId: true, date: true, shiftTypeId: true },
    }),
    prisma.monthlyConstraint.findMany({
      where: { scheduleId },
      select: { memberId: true, type: true, weight: true, value: true },
    }),
    prisma.constraint.findMany({
      where: {
        member: { calendarId: access.schedule.calendarId, isActive: true },
        OR: [{ type: { in: [...constraintTypesIn] } }, { type: "CUSTOM", note: { in: [...customSchedulerNotes] } }],
      },
      select: { memberId: true, type: true, weight: true, value: true, note: true },
    }),
  ]);

  if (!calendar) {
    return NextResponse.json({ error: "Calendario non trovato" }, { status: 404 });
  }

  const schedulerMonthlyTypes = new Set([
    "UNAVAILABLE_DATE",
    "UNAVAILABLE_SHIFT",
    "REQUIRED_DATE",
    "REQUIRED_SHIFT",
  ]);
  function includeInSchedulerMonthly(c: { type: unknown; note?: string | null }): boolean {
    const t = String(c.type);
    if (schedulerMonthlyTypes.has(t)) return true;
    if (t === "CUSTOM") {
      const n = (c.note ?? "").trim();
      return n === "GENERIC_DAY_UNLOCK" || n === "GENERIC_SHIFT_UNLOCK";
    }
    return false;
  }
  const monthlyConstraints = monthlyConstraintsRaw.filter(includeInSchedulerMonthly);

  const monthlyUnavailable = monthlyConstraintsRaw.filter((c) => {
    const t = String(c.type);
    return t === "UNAVAILABLE_DATE" || t === "UNAVAILABLE_SHIFT";
  }).length;
  const monthlyRequired = monthlyConstraintsRaw.filter((c) => {
    const t = String(c.type);
    return t === "REQUIRED_DATE" || t === "REQUIRED_SHIFT";
  }).length;
  function countCoPresenceRules(rules: unknown): number {
    if (!rules || typeof rules !== "object") return 0;
    const raw = (rules as { coPresenceRules?: unknown }).coPresenceRules;
    return Array.isArray(raw) ? raw.length : 0;
  }
  const coPresenceRules =
    countCoPresenceRules(calendar?.rules ?? null) + countCoPresenceRules(access.schedule.rules ?? null);

  const fixedAssignments: SchedulerFixedAssignment[] = existingAssignments.map((a) => {
    const iso = a.date.toISOString().slice(0, 10);
    if (!a.memberId) {
      return { shiftTypeId: a.shiftTypeId, date: iso, isGuestFixed: true as const };
    }
    return { memberId: a.memberId, shiftTypeId: a.shiftTypeId, date: iso };
  });

  const problem = buildSchedulerProblem({
    scheduleId,
    dates,
    timezone: calendar.timezone,
    calendarRules: calendar.rules,
    scheduleRules: access.schedule.rules,
    shiftTypes,
    members: members.map((m) => ({
      id: m.id,
      label: `${`${m.user.firstName} ${m.user.lastName}`.trim() || m.user.email}`,
      role: m.user.professionalRole || "",
      isJolly: m.isJolly,
      maxConsecutiveDays: m.maxConsecutiveDays,
      minRestHoursBetweenShifts: m.minRestHoursBetweenShifts,
      contractShiftsMonth: m.contractShiftsMonth,
    })),
    monthlyConstraints,
    memberConstraints,
    fixedAssignments,
    randomSeed: Date.now(),
  });

  const result = await Promise.race([
    callSchedulerSolve(scheduleId, problem),
    new Promise<RemoteSolveResult>((resolve) =>
      setTimeout(
        () =>
          resolve({
            kind: "error",
            status: "TIMEOUT",
            message:
              "Timeout generazione: il servizio OR-Tools non ha risposto in tempo. Verifica che turny-scheduler sia in esecuzione e riprova.",
          }),
        95_000,
      ),
    ),
  ]);

  if (result.kind === "error") {
    const http = result.status === "NO_SERVICE" ? 503 : result.status === "TIMEOUT" ? 504 : 422;
    const impossible = result.status === "INFEASIBLE" || result.status === "MODEL_INVALID";
    const hints =
      impossible && http === 422
        ? buildInfeasibilityHints({
            dates,
            shiftTypes: shiftTypes.map((s) => ({
              id: s.id,
              name: s.name,
              minStaff: s.minStaff,
              activeWeekdays: s.activeWeekdays,
            })),
            members: members.map((m) => ({
              id: m.id,
              isJolly: m.isJolly,
              contractShiftsMonth: effectiveMaxShiftsMonthFromConstraints(m.id, m.contractShiftsMonth, memberConstraints),
              user: m.user,
            })),
            fixedAssignments: fixedAssignments,
            monthlyConstraintsCount: monthlyConstraints.length,
            monthlyUnavailable,
            monthlyRequired,
            coPresenceRules,
          })
        : undefined;
    const solverAlerts =
      result.kind === "error" && Array.isArray(result.alerts) && result.alerts.length > 0 ? result.alerts : undefined;
    return NextResponse.json(
      {
        error: result.message,
        schedulerStatus: result.status,
        impossible,
        ...(hints ? { hints } : {}),
        ...(solverAlerts ? { solverAlerts } : {}),
      },
      { status: http },
    );
  }

  const toCreate = result.assignments.map((a) => ({
    scheduleId,
    memberId: a.memberId,
    shiftTypeId: a.shiftTypeId,
    date: new Date(`${a.date}T00:00:00.000Z`),
    isAutoGenerated: true,
  }));

  if (toCreate.length > 0) {
    await prisma.shiftAssignment.createMany({ data: toCreate, skipDuplicates: true });
  }

  const prevRaw = access.schedule.generationLog;
  const prevLog =
    prevRaw != null && typeof prevRaw === "object" && !Array.isArray(prevRaw)
      ? { ...(prevRaw as Record<string, unknown>) }
      : {};
  prevLog.lastAutoGenerateAt = new Date().toISOString();
  prevLog.lastSolverAlerts = result.alerts ?? [];

  await prisma.schedule.update({
    where: { id: scheduleId },
    data: { generationLog: prevLog as object },
  });

  return NextResponse.json({
    created: toCreate.length,
    alerts: (result.alerts ?? []) as { type: string; message?: string; memberId?: string; date?: string; shiftTypeId?: string }[],
    engine: "ortools",
    schedulerStatus: result.calendar?.solverStatus ?? "FEASIBLE",
    calendar: result.calendar,
  });
}
