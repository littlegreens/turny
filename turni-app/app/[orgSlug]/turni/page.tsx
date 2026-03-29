import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { AppBreadcrumbs } from "@/components/app-breadcrumbs";
import { OrgTurnsBoard } from "@/components/org-turns-board";
import { WorkerTurnsView } from "@/components/worker-turns-view";
import { authOptions } from "@/lib/auth";
import { hasAnyRole, normalizeRoles } from "@/lib/org-roles";
import { fetchOrgMemberDisplayColors } from "@/lib/org-member-display-colors";
import { prisma } from "@/lib/prisma";
import { resolveMemberRowColor } from "@/lib/member-row-color";

type Props = {
  params: Promise<{ orgSlug: string }>;
  searchParams?: Promise<{ calendarId?: string }>;
};

export default async function OrgTurnsPage({ params, searchParams }: Props) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const { orgSlug } = await params;
  const membership = await prisma.orgMember.findFirst({
    where: { userId: session.user.id, org: { slug: orgSlug } },
    include: { org: true },
  });
  if (!membership) notFound();

  const roles = normalizeRoles([membership.role, ...membership.roles]);
  const isWorkerOnly = !hasAnyRole(roles, ["OWNER", "ADMIN", "MANAGER"]);

  if (isWorkerOnly) {
    const qs = searchParams ? await searchParams : undefined;
    const assignedCalendars = await prisma.calendarMember.findMany({
      where: { userId: session.user.id, calendar: { orgId: membership.orgId }, isActive: true },
      select: { calendarId: true, calendar: { select: { id: true, name: true } } },
      orderBy: { calendar: { name: "asc" } },
    });
    const calendars = assignedCalendars.map((item) => item.calendar);
    if (calendars.length === 0) {
      return (
        <>
          <AppBreadcrumbs
            items={[
              { label: "Home", href: "/" },
              { label: "Turni" },
            ]}
          />
          <h2 className="h2 fw-bold mt-3">Turni</h2>
          <p className="text-secondary mb-0">Non hai ancora calendari assegnati.</p>
        </>
      );
    }

    const selectedCalendarId = calendars.some((c) => c.id === qs?.calendarId) ? qs?.calendarId : calendars[0].id;
    const selectedCalendar = calendars.find((c) => c.id === selectedCalendarId)!;
    const schedule = await prisma.schedule.findFirst({
      where: { calendarId: selectedCalendarId, status: { not: "ARCHIVED" } },
      orderBy: [{ year: "desc" }, { month: "desc" }, { createdAt: "desc" }],
    });

    return (
      <>
        <AppBreadcrumbs
          items={[
            { label: "Home", href: "/" },
            { label: "Turni" },
          ]}
        />
        <h2 className="h2 fw-bold mt-3">Turni</h2>
        <p className="text-secondary mb-3">Vista sola lettura dei turni assegnati al tuo profilo.</p>

        {calendars.length > 1 ? (
          <form method="get" className="mb-3">
            <label className="form-label small mb-1">Calendari</label>
            <div className="d-flex gap-2 flex-wrap align-items-center">
              <select name="calendarId" defaultValue={selectedCalendarId} className="form-select" style={{ maxWidth: 280 }}>
                {calendars.map((cal) => (
                  <option key={cal.id} value={cal.id}>{cal.name}</option>
                ))}
              </select>
              <button type="submit" className="btn btn-outline-success">Apri</button>
            </div>
          </form>
        ) : null}

        {!schedule ? (
          <section className="card mt-3">
            <div className="card-body">
              <p className="text-secondary mb-0">Nessun turno attivo trovato per il calendario {selectedCalendar.name}.</p>
            </div>
          </section>
        ) : (
          <WorkerTurnsPreviewContainer scheduleId={schedule.id} currentUserId={session.user.id} />
        )}
      </>
    );
  }

  const isManagerOnly = hasAnyRole(roles, ["MANAGER"]) && !hasAnyRole(roles, ["OWNER", "ADMIN"]);
  const assignedCalendarIds = isManagerOnly
    ? (
        await prisma.calendarMember.findMany({
          where: { userId: session.user.id, calendar: { orgId: membership.orgId } },
          select: { calendarId: true },
        })
      ).map((m) => m.calendarId)
    : [];

  const todayIso = new Date().toISOString().slice(0, 10);
  const toArchive = await prisma.schedule.findMany({
    where: {
      calendar: { orgId: membership.orgId },
      status: { not: "ARCHIVED" },
    },
    select: { id: true, generationLog: true },
  });
  const archiveIds = toArchive
    .filter((s) => {
      const end = (s.generationLog as { endDate?: string } | null)?.endDate;
      return Boolean(end && end < todayIso);
    })
    .map((s) => s.id);
  if (archiveIds.length > 0) {
    await prisma.schedule.updateMany({
      where: { id: { in: archiveIds } },
      data: { status: "ARCHIVED" },
    });
  }

  const schedules = await prisma.schedule.findMany({
    where: {
      calendar: { orgId: membership.orgId },
      status: { not: "ARCHIVED" },
      ...(isManagerOnly ? { calendarId: { in: assignedCalendarIds } } : {}),
    },
    include: { calendar: { select: { id: true, name: true } } },
    orderBy: [{ year: "desc" }, { month: "desc" }, { createdAt: "desc" }],
  });
  const calendars = await prisma.calendar.findMany({
    where: {
      orgId: membership.orgId,
      isActive: true,
      ...(isManagerOnly ? { id: { in: assignedCalendarIds } } : {}),
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const canCreate = hasAnyRole(roles, ["OWNER", "ADMIN", "MANAGER"]);

  const turnsByCalendarMap = new Map<string, { calendarId: string; calendarName: string; turns: { id: string; calendarId: string; calendarName: string; year: number; month: number; status: "DRAFT" | "PUBLISHED" | "ARCHIVED"; generationLog: unknown }[] }>();
  for (const s of schedules) {
    const key = s.calendar.id;
    if (!turnsByCalendarMap.has(key)) {
      turnsByCalendarMap.set(key, { calendarId: s.calendar.id, calendarName: s.calendar.name, turns: [] });
    }
    turnsByCalendarMap.get(key)!.turns.push({
      id: s.id,
      calendarId: s.calendar.id,
      calendarName: s.calendar.name,
      year: s.year,
      month: s.month,
      status: s.status,
      generationLog: s.generationLog,
    });
  }
  const turnsByCalendar = [...turnsByCalendarMap.values()].map((g) => ({
    ...g,
    turns: g.turns.sort((a, b) => (a.year - b.year) || (a.month - b.month)),
  }));

  return (
    <>
      <AppBreadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Turni" },
        ]}
      />
      <OrgTurnsBoard orgSlug={membership.org.slug} canCreate={canCreate} calendars={calendars} turnsByCalendar={turnsByCalendar} />
    </>
  );
}

async function WorkerTurnsPreviewContainer({ scheduleId, currentUserId }: { scheduleId: string; currentUserId: string }) {
  const schedule = await prisma.schedule.findUnique({
    where: { id: scheduleId },
    include: { calendar: true },
  });
  if (!schedule) {
    return null;
  }
  const [shiftTypes, membersRaw, assignments] = await Promise.all([
    prisma.shiftType.findMany({
      where: { calendarId: schedule.calendarId, isActive: true },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    }),
    prisma.calendarMember.findMany({
      where: { calendarId: schedule.calendarId, isActive: true },
      include: {
        user: { select: { firstName: true, lastName: true, email: true } },
        constraints: { where: { type: "CUSTOM", note: "MEMBER_COLOR" }, select: { value: true } },
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
  ]);

  const userIds = [...new Set(membersRaw.map((m) => m.userId))];
  const orgMemberColors = await fetchOrgMemberDisplayColors(schedule.calendar.orgId, userIds);
  const orgColorByUser = new Map(orgMemberColors.map((o) => [o.userId, o]));

  const members = membersRaw.map((m) => {
    const fromCustom = m.constraints.find((c) => c.type === "CUSTOM" && c.note === "MEMBER_COLOR");
    const calOnly = (fromCustom?.value as { color?: string } | undefined)?.color ?? null;
    const orgRow = orgColorByUser.get(m.userId);
    return {
      id: m.id,
      userId: m.userId,
      label: `${`${m.user.firstName} ${m.user.lastName}`.trim() || m.user.email}`,
      memberColor: resolveMemberRowColor({
        calendarConstraintColor: calOnly,
        orgDefaultColor: orgRow?.defaultDisplayColor ?? null,
        orgUseDefaultInCalendars: orgRow?.useDisplayColorInCalendars ?? true,
      }),
    };
  });

  const periodMeta = (schedule.generationLog ?? {}) as { startDate?: string; endDate?: string };
  return (
    <WorkerTurnsView
      year={schedule.year}
      month={schedule.month}
      startDate={periodMeta.startDate}
      endDate={periodMeta.endDate}
      currentUserId={currentUserId}
      shiftTypes={shiftTypes.map((st) => ({
        id: st.id,
        name: st.name,
        startTime: st.startTime,
        endTime: st.endTime,
        color: st.color,
        activeWeekdays: st.activeWeekdays,
      }))}
      members={members}
      assignments={assignments.map((a) => ({
        id: a.id,
        memberId: a.memberId,
        shiftTypeId: a.shiftTypeId,
        date: a.date.toISOString().slice(0, 10),
        memberLabel: `${`${a.member.user.firstName} ${a.member.user.lastName}`.trim() || a.member.user.email}`,
        shiftTypeName: a.shiftType.name,
        shiftTypeColor: a.shiftType.color,
      }))}
    />
  );
}

