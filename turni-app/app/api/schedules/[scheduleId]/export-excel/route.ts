import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { hasAnyRole } from "@/lib/org-roles";
import { authorizeScheduleAccess } from "@/lib/schedule-access";
import { fetchOrgMemberDisplayColors } from "@/lib/org-member-display-colors";
import { resolveMemberRowColor } from "@/lib/member-row-color";
import { parseHolidayOverrides } from "@/lib/holiday-overrides";
import { prisma } from "@/lib/prisma";
import { buildScheduleExcelBuffer, type PersonForExcelSummary } from "@/lib/schedule-excel-export";

type Params = { params: Promise<{ scheduleId: string }> };

function capitalizeFirst(value: string) {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function safeFilenamePart(value: string) {
  return value.replace(/[^\w\u00C0-\u024F.-]+/g, "_").replace(/_+/g, "_").slice(0, 80);
}

export async function GET(_: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  const { scheduleId } = await params;
  const access = await authorizeScheduleAccess(scheduleId, session.user.id);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  if (!hasAnyRole(access.roles, ["OWNER", "ADMIN", "MANAGER"])) {
    return NextResponse.json({ error: "Permessi insufficienti" }, { status: 403 });
  }

  const schedule = await prisma.schedule.findUnique({
    where: { id: scheduleId },
    include: { calendar: { select: { id: true, name: true, orgId: true, rules: true } } },
  });
  if (!schedule) return NextResponse.json({ error: "Turno non trovato" }, { status: 404 });

  const [shiftTypes, members, assignments] = await Promise.all([
    prisma.shiftType.findMany({
      where: { calendarId: schedule.calendarId, isActive: true },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    }),
    prisma.calendarMember.findMany({
      where: { calendarId: schedule.calendarId, isActive: true },
      include: {
        user: { select: { firstName: true, lastName: true, email: true } },
        constraints: {
          where: { type: "CUSTOM", note: "MEMBER_COLOR" },
          select: { value: true },
        },
      },
      orderBy: { joinedAt: "asc" },
    }),
    prisma.shiftAssignment.findMany({
      where: { scheduleId: schedule.id },
      include: {
        member: { include: { user: { select: { firstName: true, lastName: true, email: true } } } },
      },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    }),
  ]);

  const userIds = [...new Set(members.map((m) => m.userId))];
  const orgMemberColors = await fetchOrgMemberDisplayColors(schedule.calendar.orgId, userIds);
  const orgColorByUser = new Map(orgMemberColors.map((o) => [o.userId, o]));

  const memberColorById = new Map<string, string | null>();
  const memberLabelById = new Map<string, string>();
  for (const m of members) {
    const calColor =
      (m.constraints[0]?.value as { color?: string } | undefined)?.color ?? null;
    const orgRow = orgColorByUser.get(m.userId);
    memberColorById.set(
      m.id,
      resolveMemberRowColor({
        calendarConstraintColor: calColor,
        orgDefaultColor: orgRow?.defaultDisplayColor ?? null,
        orgUseDefaultInCalendars: orgRow?.useDisplayColorInCalendars ?? true,
      }),
    );
    memberLabelById.set(
      m.id,
      `${`${m.user.firstName} ${m.user.lastName}`.trim() || m.user.email}`,
    );
  }

  const periodMeta = (schedule.generationLog ?? {}) as { startDate?: string; endDate?: string; periodType?: string };
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

  const excelAssignments = assignments.map((a) => {
    const memberLabel = a.member
      ? `${`${a.member.user.firstName} ${a.member.user.lastName}`.trim() || a.member.user.email}`
      : (a.guestLabel?.trim() || "Extra");
    const memberColor = a.memberId
      ? (memberColorById.get(a.memberId) ?? null)
      : (a.guestColor ?? null);
    return {
      shiftTypeId: a.shiftTypeId,
      date: a.date.toISOString().slice(0, 10),
      memberLabel,
      memberColor,
    };
  });

  const extraMeta = new Map<string, { label: string; color: string | null }>();
  for (const a of assignments) {
    if (a.memberId) continue;
    const label = a.guestLabel?.trim() || "Extra";
    const key = `g:${label}|${a.guestColor ?? ""}`;
    extraMeta.set(key, { label, color: a.guestColor ?? null });
  }

  const summaryPeople: PersonForExcelSummary[] = [
    ...members
      .map((m) => ({
        key: m.id,
        label: memberLabelById.get(m.id) ?? "",
        color: memberColorById.get(m.id) ?? null,
      }))
      .filter((p) => p.label),
    ...[...extraMeta.entries()]
      .map(([key, meta]) => ({ key, label: meta.label, color: meta.color }))
      .sort((a, b) => a.label.localeCompare(b.label, "it")),
  ];

  try {
    const buffer = await buildScheduleExcelBuffer({
      calendarName: schedule.calendar.name,
      year: schedule.year,
      month: schedule.month,
      startDate: periodMeta.startDate,
      endDate: periodMeta.endDate,
      periodLabel,
      shiftTypes: shiftTypes.map((st) => ({
        id: st.id,
        name: st.name,
        startTime: st.startTime,
        endTime: st.endTime,
        color: st.color,
        order: st.order,
        activeWeekdays: st.activeWeekdays,
      })),
      assignments: excelAssignments,
      summaryPeople,
      holidayOverrides: holidayOverridesMerged as any,
    });

    const monthPart =
      periodMeta.periodType === "WEEKLY" || periodMeta.periodType === "CUSTOM"
        ? safeFilenamePart(periodLabel)
        : `${String(schedule.month).padStart(2, "0")}_${schedule.year}`;
    const filename = `Turni_${safeFilenamePart(schedule.calendar.name)}_${monthPart}.xlsx`;

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Export Excel fallito: ${msg}` }, { status: 500 });
  }
}
