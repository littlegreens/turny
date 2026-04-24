import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { AppBreadcrumbs } from "@/components/app-breadcrumbs";
import { ScheduleGridPanel } from "@/components/schedule-grid-panel";
import { authOptions } from "@/lib/auth";
import { hasAnyRole, normalizeRoles } from "@/lib/org-roles";
import { canEditScheduleAssignments } from "@/lib/schedule-access";
import { fetchOrgMemberDisplayColors } from "@/lib/org-member-display-colors";
import { prisma } from "@/lib/prisma";
import { resolveMemberRowColor } from "@/lib/member-row-color";
import { parseHolidayOverrides } from "@/lib/holiday-overrides";
import { buildScheduleReport } from "@/lib/schedule-report";
import { shiftIsNight } from "@/lib/scheduler-problem";

type Props = {
  params: Promise<{ orgSlug: string; calId: string; schedId: string }>;
  searchParams?: Promise<{ preview?: string }>;
};

function capitalizeFirst(value: string) {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default async function ScheduleGridPage({ params, searchParams }: Props) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const { orgSlug, calId, schedId } = await params;
  const qs = searchParams ? await searchParams : undefined;
  const initialPreviewOpen = qs?.preview === "1";
  const schedule = await prisma.schedule.findUnique({
    where: { id: schedId },
    include: { calendar: { include: { org: true } } },
  });
  if (!schedule || schedule.calendarId !== calId || schedule.calendar.org.slug !== orgSlug) notFound();

  const membership = await prisma.orgMember.findFirst({
    where: { userId: session.user.id, orgId: schedule.calendar.orgId },
  });
  if (!membership) notFound();
  const roles = normalizeRoles([membership.role, ...membership.roles]);
  const isManagerOnly = hasAnyRole(roles, ["MANAGER"]) && !hasAnyRole(roles, ["OWNER", "ADMIN"]);
  if (isManagerOnly) {
    const assigned = await prisma.calendarMember.findUnique({
      where: { calendarId_userId: { calendarId: schedule.calendarId, userId: session.user.id } },
    });
    if (!assigned) notFound();
  }

  const [shiftTypes, members, assignments, monthlyConstraints] = await Promise.all([
    prisma.shiftType.findMany({
      where: { calendarId: schedule.calendarId, isActive: true },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    }),
    prisma.calendarMember.findMany({
      where: { calendarId: schedule.calendarId, isActive: true },
      include: {
        user: { select: { firstName: true, lastName: true, email: true, professionalRole: true } },
        constraints: {
          where: {
            OR: [
              { type: { in: ["UNAVAILABLE_WEEKDAY", "MAX_SHIFTS_WEEK", "UNAVAILABLE_SHIFT"] } },
              {
                type: "CUSTOM",
                note: {
                  in: [
                    "MEMBER_COLOR",
                    "VACATION_DAYS_PERIOD",
                    "TARGET_SHIFTS_MONTH",
                    "TARGET_NIGHTS_MONTH",
                    "TARGET_SATURDAYS_MONTH",
                    "TARGET_SUNDAYS_MONTH",
                  ],
                },
              },
            ],
          },
          select: { type: true, value: true, note: true },
        },
      },
      orderBy: { joinedAt: "asc" },
    }),
    prisma.shiftAssignment.findMany({
      where: { scheduleId: schedule.id },
      include: {
        member: { include: { user: { select: { firstName: true, lastName: true, email: true } } } },
        shiftType: { select: { id: true, name: true, color: true } },
      },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    }),
    prisma.monthlyConstraint.findMany({
      where: { scheduleId: schedule.id },
      select: { id: true, memberId: true, type: true, value: true, note: true },
    }),
  ]);

  const gridMonthlyTypes = new Set([
    "UNAVAILABLE_DATE",
    "UNAVAILABLE_SHIFT",
    "REQUIRED_DATE",
    "REQUIRED_SHIFT",
  ]);
  const monthlyConstraintsForGrid = monthlyConstraints.filter((c) => {
    const t = String(c.type);
    if (gridMonthlyTypes.has(t)) return true;
    if (t === "CUSTOM") {
      const n = (c.note ?? "").trim();
      return n === "GENERIC_DAY_UNLOCK" || n === "GENERIC_SHIFT_UNLOCK";
    }
    return false;
  });

  const userIds = [...new Set(members.map((m) => m.userId))];
  const orgMemberColors = await fetchOrgMemberDisplayColors(schedule.calendar.orgId, userIds);
  const orgColorByUser = new Map(orgMemberColors.map((o) => [o.userId, o]));

  const canEdit = canEditScheduleAssignments(roles, schedule.status);
  const canManageSchedule = hasAnyRole(roles, ["OWNER", "ADMIN", "MANAGER"]);
  const periodMeta = (schedule.generationLog ?? {}) as { startDate?: string; endDate?: string; periodType?: string };
  const schedulePeriodType =
    periodMeta.periodType === "WEEKLY" || periodMeta.periodType === "CUSTOM" ? periodMeta.periodType : "MONTHLY";
  const periodLabel =
    periodMeta.periodType === "WEEKLY" || periodMeta.periodType === "CUSTOM"
      ? `dal ${periodMeta.startDate ?? "?"} al ${periodMeta.endDate ?? "?"}`
      : `${capitalizeFirst(new Intl.DateTimeFormat("it-IT", { month: "long" }).format(new Date(schedule.year, schedule.month - 1, 1)))} ${schedule.year}`;

  const holidayOverridesMerged = (() => {
    const m = new Map<string, unknown>();
    for (const h of parseHolidayOverrides(schedule.calendar.rules)) m.set(h.date, h);
    for (const h of parseHolidayOverrides(schedule.rules)) m.set(h.date, h);
    return [...m.values()];
  })();

  const report = buildScheduleReport({
    year: schedule.year,
    month: schedule.month,
    shiftTypes: shiftTypes.map((st) => ({
      id: st.id,
      name: st.name,
      minStaff: st.minStaff,
      maxStaff: st.maxStaff,
      durationHours: st.durationHours,
      activeWeekdays: st.activeWeekdays,
      isNight: shiftIsNight(st),
    })),
    assignments: assignments.map((a) => ({
      ...(a.memberId ? { memberId: a.memberId } : {}),
      guestLabel: a.guestLabel,
      guestColor: a.guestColor,
      shiftTypeId: a.shiftTypeId,
      date: a.date.toISOString().slice(0, 10),
    })),
    members: members.map((m) => ({
      id: m.id,
      label: `${`${m.user.firstName} ${m.user.lastName}`.trim() || m.user.email}`,
      email: m.user.email,
      professionalRole: m.user.professionalRole || "",
      contractMode: m.contractMode,
    })),
    holidayOverrides: holidayOverridesMerged as any,
  });

  const generationLog = schedule.generationLog as { lastSolverAlerts?: unknown[] } | null | undefined;
  const fromLog = generationLog?.lastSolverAlerts;
  const initialSolverAlerts = Array.isArray(fromLog) ? fromLog : [];

  return (
    <>
      <AppBreadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Turni", href: `/${orgSlug}/turni` },
          { label: `${schedule.calendar.name} ${periodLabel}` },
        ]}
      />

      <h2 className="h2 mt-3">Configuratore turni</h2>
      <h3 className="mb-3">
        {schedule.calendar.name} · {periodLabel}
      </h3>

      <ScheduleGridPanel
        scheduleId={schedule.id}
        orgSlug={orgSlug}
        calId={calId}
        scheduleStatus={schedule.status}
        canManageSchedule={canManageSchedule}
        calendarName={schedule.calendar.name}
        periodLabel={periodLabel}
        schedulePeriodType={schedulePeriodType}
        initialPreviewOpen={initialPreviewOpen}
        currentUserId={session.user.id}
        year={schedule.year}
        month={schedule.month}
        startDate={periodMeta.startDate}
        endDate={periodMeta.endDate}
        canEdit={canEdit}
        scheduleRules={(schedule.rules ?? null) as unknown}
        holidayOverrides={holidayOverridesMerged as any}
        shiftTypes={shiftTypes.map((st) => ({
          id: st.id,
          name: st.name,
          startTime: st.startTime,
          endTime: st.endTime,
          color: st.color,
          minStaff: st.minStaff,
          maxStaff: st.maxStaff,
          activeWeekdays: st.activeWeekdays,
        }))}
        members={members.map((m) => {
          const calColor =
            (m.constraints.find((c) => c.type === "CUSTOM" && c.note === "MEMBER_COLOR")?.value as { color?: string } | undefined)?.color ??
            null;
          const orgRow = orgColorByUser.get(m.userId);
          const memberColor = resolveMemberRowColor({
            calendarConstraintColor: calColor,
            orgDefaultColor: orgRow?.defaultDisplayColor ?? null,
            orgUseDefaultInCalendars: orgRow?.useDisplayColorInCalendars ?? true,
          });
          const cfgShifts = m.constraints.find((c) => c.type === "CUSTOM" && c.note === "TARGET_SHIFTS_MONTH");
          const cfgNights = m.constraints.find((c) => c.type === "CUSTOM" && c.note === "TARGET_NIGHTS_MONTH");
          const cfgSats = m.constraints.find((c) => c.type === "CUSTOM" && c.note === "TARGET_SATURDAYS_MONTH");
          const cfgSuns = m.constraints.find((c) => c.type === "CUSTOM" && c.note === "TARGET_SUNDAYS_MONTH");
          const cfgVac = m.constraints.find((c) => c.type === "CUSTOM" && c.note === "VACATION_DAYS_PERIOD");
          const vacRaw = (cfgVac?.value as { days?: number } | undefined)?.days;
          const vacationDays = typeof vacRaw === "number" && vacRaw >= 0 ? Math.floor(vacRaw) : 0;
          return {
            id: m.id,
            userId: m.userId,
            label: `${`${m.user.firstName} ${m.user.lastName}`.trim() || m.user.email}`,
            professionalRole: m.user.professionalRole || "",
            contractShiftsWeek: m.contractShiftsWeek ?? null,
            contractShiftsMonth:
              typeof (cfgShifts?.value as { shifts?: number } | undefined)?.shifts === "number"
                ? (cfgShifts!.value as { shifts: number }).shifts
                : (m.contractShiftsMonth ?? null),
            vacationDays,
            configMaxNights:
              typeof (cfgNights?.value as { nights?: number } | undefined)?.nights === "number"
                ? (cfgNights!.value as { nights: number }).nights
                : null,
            configMaxSaturdays:
              typeof (cfgSats?.value as { saturdays?: number } | undefined)?.saturdays === "number"
                ? (cfgSats!.value as { saturdays: number }).saturdays
                : null,
            configMaxSundays:
              typeof (cfgSuns?.value as { sundays?: number } | undefined)?.sundays === "number"
                ? (cfgSuns!.value as { sundays: number }).sundays
                : null,
            baseUnavailableWeekdays: m.constraints
              .filter((c) => c.type === "UNAVAILABLE_WEEKDAY")
              .map((c) => Number((c.value as { weekday?: number }).weekday))
              .filter((n) => !Number.isNaN(n)),
            baseUnavailableShiftTypeIds: m.constraints
              .filter((c) => c.type === "UNAVAILABLE_SHIFT")
              .map((c) => String((c.value as { shiftTypeId?: string }).shiftTypeId ?? ""))
              .filter(Boolean),
            memberColor,
            calendarColorOverride: calColor,
          };
        })}
        assignments={assignments.map((a) => {
          const guest = !a.memberId;
          const memberLabel = a.member
            ? `${`${a.member.user.firstName} ${a.member.user.lastName}`.trim() || a.member.user.email}`
            : (a.guestLabel?.trim() || "Extra");
          return {
            id: a.id,
            memberId: a.memberId ?? "",
            isGuest: guest,
            ...(guest
              ? { guestLabel: a.guestLabel ?? undefined, guestColor: a.guestColor ?? undefined }
              : {}),
            shiftTypeId: a.shiftTypeId,
            date: a.date.toISOString().slice(0, 10),
            memberLabel,
            shiftTypeName: a.shiftType.name,
            shiftTypeColor: a.shiftType.color,
            isAutoGenerated: a.isAutoGenerated,
          };
        })}
        monthlyUnavailable={monthlyConstraintsForGrid.map((c) => {
          const t = String(c.type);
          if (t === "CUSTOM") {
            const v = c.value as { date?: string; shiftTypeId?: string };
            return {
              id: c.id,
              memberId: c.memberId,
              date: v.date ?? "",
              type: "CUSTOM" as const,
              note: (c.note ?? "").trim(),
              shiftTypeId: v.shiftTypeId ?? null,
            };
          }
          return {
            id: c.id,
            memberId: c.memberId,
            date: (c.value as { date?: string })?.date ?? "",
            type: c.type as "UNAVAILABLE_DATE" | "UNAVAILABLE_SHIFT" | "REQUIRED_DATE" | "REQUIRED_SHIFT",
            shiftTypeId: (c.value as { shiftTypeId?: string })?.shiftTypeId ?? null,
            note: null,
          };
        })}
        reportSummary={report}
        initialSolverAlerts={initialSolverAlerts}
      />

      <div className="mt-4">
        <Link href={`/${orgSlug}/turni`} className="turny-back-link">← Turni</Link>
      </div>
    </>
  );
}
