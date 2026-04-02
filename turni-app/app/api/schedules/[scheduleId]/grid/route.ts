import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { authorizeScheduleAccess } from "@/lib/schedule-access";
import { prisma } from "@/lib/prisma";

type Params = {
  params: Promise<{ scheduleId: string }>;
};

/** Dati aggregati per la griglia turni (giorni × tipi turno). */
export async function GET(_: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  const { scheduleId } = await params;
  const access = await authorizeScheduleAccess(scheduleId, session.user.id);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const { schedule, calendar } = access;

  const [shiftTypes, members, assignments, monthlyConstraints] = await Promise.all([
    prisma.shiftType.findMany({
      where: { calendarId: schedule.calendarId, isActive: true },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        name: true,
        startTime: true,
        endTime: true,
        color: true,
        minStaff: true,
        activeWeekdays: true,
      },
    }),
    prisma.calendarMember.findMany({
      where: { calendarId: schedule.calendarId, isActive: true },
      include: { user: { select: { firstName: true, lastName: true, email: true } } },
      orderBy: { joinedAt: "asc" },
    }),
    prisma.shiftAssignment.findMany({
      where: { scheduleId },
      include: {
        member: {
          include: { user: { select: { firstName: true, lastName: true, email: true } } },
        },
        shiftType: { select: { id: true, name: true, color: true } },
      },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    }),
    prisma.monthlyConstraint.findMany({
      where: { scheduleId, type: "UNAVAILABLE_DATE" },
      select: { id: true, memberId: true, value: true },
    }),
  ]);

  return NextResponse.json({
    schedule: {
      id: schedule.id,
      year: schedule.year,
      month: schedule.month,
      status: schedule.status,
      calendarId: schedule.calendarId,
    },
    calendar: {
      activeWeekdays: calendar.activeWeekdays,
      timezone: calendar.timezone,
    },
    shiftTypes,
    members: members.map((m) => ({
      id: m.id,
      label: `${`${m.user.firstName} ${m.user.lastName}`.trim() || m.user.email}`,
    })),
    assignments: assignments.map((a) => {
      const guest = !a.memberId;
      const memberLabel = a.member
        ? `${`${a.member.user.firstName} ${a.member.user.lastName}`.trim() || a.member.user.email}`
        : (a.guestLabel?.trim() || "Extra");
      return {
        id: a.id,
        memberId: a.memberId ?? "",
        isGuest: guest,
        ...(guest ? { guestColor: a.guestColor ?? undefined, guestLabel: a.guestLabel ?? undefined } : {}),
        shiftTypeId: a.shiftTypeId,
        date: a.date.toISOString().slice(0, 10),
        memberLabel,
        shiftTypeName: a.shiftType.name,
        shiftTypeColor: a.shiftType.color,
      };
    }),
    monthlyUnavailable: monthlyConstraints.map((c) => ({
      memberId: c.memberId,
      date: (c.value as { date?: string })?.date ?? "",
    })),
  });
}
