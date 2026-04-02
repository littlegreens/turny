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
import { isSuperAdminEmail } from "@/lib/super-admin";
import { parseHolidayOverrides, type HolidayOverrideDraft } from "@/lib/holiday-overrides";

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
  const superAdmin = isSuperAdminEmail(session.user.email ?? null);
  if (!membership && !superAdmin) notFound();
  const org = membership?.org ?? (await prisma.organization.findUnique({ where: { slug: orgSlug } }));
  if (!org) notFound();

  const roles = membership ? normalizeRoles([membership.role, ...membership.roles]) : ["OWNER", "ADMIN"];
  const isWorkerOnly = !hasAnyRole(roles, ["OWNER", "ADMIN", "MANAGER"]);

  if (isWorkerOnly) {
    const qs = searchParams ? await searchParams : undefined;
    const assignedCalendars = await prisma.calendarMember.findMany({
      where: { userId: session.user.id, calendar: { orgId: org.id }, isActive: true },
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
          <h2 className="h2 mt-3">Turni</h2>
          <div className="border rounded p-4 text-center" role="status">
            <p className="fw-semibold mb-1">Nessun calendario assegnato</p>
            <p className="small text-secondary mb-0">Contatta l&apos;amministratore per essere aggiunto a un calendario.</p>
          </div>
        </>
      );
    }

    const selectedCalendarId = calendars.some((c) => c.id === qs?.calendarId) ? qs?.calendarId : calendars[0].id;
    const selectedCalendar = calendars.find((c) => c.id === selectedCalendarId)!;
    const schedule =
      (await prisma.schedule.findFirst({
        where: { calendarId: selectedCalendarId, status: "PUBLISHED" },
        orderBy: [{ year: "desc" }, { month: "desc" }, { publishedAt: "desc" }],
      })) ??
      (await prisma.schedule.findFirst({
        where: { calendarId: selectedCalendarId, status: "DRAFT" },
        orderBy: [{ year: "desc" }, { month: "desc" }, { createdAt: "desc" }],
      }));

    return (
      <>
        <AppBreadcrumbs
          items={[
            { label: "Home", href: "/" },
            { label: "Turni" },
          ]}
        />
        <h2 className="h2 mt-3">Turni</h2>
        <p className="text-secondary mb-3">I turni assegnati al tuo profilo, in sola lettura.</p>

        {calendars.length > 1 ? (
          <form method="get" className="mb-3">
            <label className="form-label small mb-1">Calendario</label>
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
          where: { userId: session.user.id, calendar: { orgId: org.id } },
          select: { calendarId: true },
        })
      ).map((m) => m.calendarId)
    : [];

  const schedules = await prisma.schedule.findMany({
    where: {
      calendar: { orgId: org.id },
      status: { not: "ARCHIVED" },
      ...(isManagerOnly ? { calendarId: { in: assignedCalendarIds } } : {}),
    },
    include: { calendar: { select: { id: true, name: true, color: true, aiConfig: true } } },
    orderBy: [{ year: "desc" }, { month: "desc" }, { createdAt: "desc" }],
  });
  const calendars = await prisma.calendar.findMany({
    where: {
      orgId: org.id,
      isActive: true,
      ...(isManagerOnly ? { id: { in: assignedCalendarIds } } : {}),
    },
    select: { id: true, name: true, aiConfig: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  const calendarsSorted = [...calendars].sort((a, b) => {
    const ordA = typeof (a.aiConfig as { orderIndex?: number } | null)?.orderIndex === "number"
      ? ((a.aiConfig as { orderIndex?: number }).orderIndex as number)
      : Number.MAX_SAFE_INTEGER;
    const ordB = typeof (b.aiConfig as { orderIndex?: number } | null)?.orderIndex === "number"
      ? ((b.aiConfig as { orderIndex?: number }).orderIndex as number)
      : Number.MAX_SAFE_INTEGER;
    if (ordA !== ordB) return ordA - ordB;
    return a.name.localeCompare(b.name, "it");
  });
  const canCreate = hasAnyRole(roles, ["OWNER", "ADMIN", "MANAGER"]);

  const turnsByCalendarMap = new Map<string, { calendarId: string; calendarName: string; calendarOrder: number; turns: { id: string; calendarId: string; calendarName: string; calendarColor: string; year: number; month: number; status: "DRAFT" | "PUBLISHED" | "ARCHIVED"; generationLog: unknown }[] }>();
  for (const s of schedules) {
    const key = s.calendar.id;
    const calendarOrder = (s.calendar.aiConfig as { orderIndex?: number } | null)?.orderIndex;
    if (!turnsByCalendarMap.has(key)) {
      turnsByCalendarMap.set(key, {
        calendarId: s.calendar.id,
        calendarName: s.calendar.name,
        calendarOrder: typeof calendarOrder === "number" ? calendarOrder : Number.MAX_SAFE_INTEGER,
        turns: [],
      });
    }
    turnsByCalendarMap.get(key)!.turns.push({
      id: s.id,
      calendarId: s.calendar.id,
      calendarName: s.calendar.name,
      calendarColor: s.calendar.color,
      year: s.year,
      month: s.month,
      status: s.status,
      generationLog: s.generationLog,
    });
  }
  const turnsByCalendar = [...turnsByCalendarMap.values()].map((g) => ({
    ...g,
    turns: g.turns.sort((a, b) => (a.year - b.year) || (a.month - b.month)),
  })).sort((a, b) => (a.calendarOrder - b.calendarOrder) || a.calendarName.localeCompare(b.calendarName, "it"));

  return (
    <>
      <AppBreadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Turni" },
        ]}
      />
      <h2 className="h2 mt-3">Turni</h2>
      <p className="text-secondary mb-0">Gestisci i piani turni attivi, organizzati per calendario.</p>
      <OrgTurnsBoard orgSlug={org.slug} canCreate={canCreate} calendars={calendarsSorted.map((c) => ({ id: c.id, name: c.name }))} turnsByCalendar={turnsByCalendar} />
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
        constraints: { where: { type: "CUSTOM", note: "MEMBER_COLOR" }, select: { type: true, note: true, value: true } },
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
  const holidayOverridesMerged = (() => {
    const m = new Map<string, unknown>();
    for (const h of parseHolidayOverrides(schedule.calendar.rules)) m.set(h.date, h);
    for (const h of parseHolidayOverrides(schedule.rules)) m.set(h.date, h);
    return [...m.values()] as HolidayOverrideDraft[];
  })();

  /** Profilo account: il worker lo gestisce da «I miei dati» (/members), non da qui. */
  return (
    <WorkerTurnsView
      year={schedule.year}
      month={schedule.month}
      startDate={periodMeta.startDate}
      endDate={periodMeta.endDate}
      currentUserId={currentUserId}
      holidayOverrides={holidayOverridesMerged}
      shiftTypes={shiftTypes.map((st) => ({
        id: st.id,
        name: st.name,
        startTime: st.startTime,
        endTime: st.endTime,
        color: st.color,
        minStaff: st.minStaff,
        activeWeekdays: st.activeWeekdays,
      }))}
      members={members}
      assignments={assignments.map((a) => {
        const guest = !a.memberId;
        const memberLabel = a.member
          ? `${`${a.member.user.firstName} ${a.member.user.lastName}`.trim() || a.member.user.email}`
          : (a.guestLabel?.trim() || "Extra");
        return {
          id: a.id,
          memberId: a.memberId ?? "",
          isGuest: guest,
          ...(guest ? { guestColor: a.guestColor ?? undefined } : {}),
          shiftTypeId: a.shiftTypeId,
          date: a.date.toISOString().slice(0, 10),
          memberLabel,
          shiftTypeName: a.shiftType.name,
          shiftTypeColor: a.shiftType.color,
        };
      })}
    />
  );
}

