import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { AppBreadcrumbs } from "@/components/app-breadcrumbs";
import { ScheduleMonthlyConstraintsPanel } from "@/components/schedule-monthly-constraints-panel";
import { authOptions } from "@/lib/auth";
import { hasAnyRole, normalizeRoles } from "@/lib/org-roles";
import { prisma } from "@/lib/prisma";

type Props = {
  params: Promise<{ orgSlug: string; calId: string; schedId: string }>;
};

export default async function ScheduleAvailabilityPage({ params }: Props) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const { orgSlug, calId, schedId } = await params;
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

  const members = await prisma.calendarMember.findMany({
    where: { calendarId: schedule.calendarId, isActive: true },
    include: { user: { select: { firstName: true, lastName: true, email: true } } },
    orderBy: { joinedAt: "asc" },
  });
  const constraints = await prisma.monthlyConstraint.findMany({
    where: { scheduleId: schedule.id },
    include: {
      member: { include: { user: { select: { firstName: true, lastName: true, email: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <>
      <AppBreadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Turni", href: `/${orgSlug}/turni` },
          { label: "Disponibilità" },
        ]}
      />
      <h2 className="h2 mt-3">Disponibilità mese — {String(schedule.month).padStart(2, "0")}/{schedule.year}</h2>
      <p className="text-secondary mb-3">Inserisci le indisponibilità specifiche del mese per ciascuna persona.</p>

      <ScheduleMonthlyConstraintsPanel
        scheduleId={schedule.id}
        year={schedule.year}
        month={schedule.month}
        canEdit={hasAnyRole(roles, ["OWNER", "ADMIN", "MANAGER", "WORKER"])}
        members={members.map((m) => ({
          id: m.id,
          label: `${`${m.user.firstName} ${m.user.lastName}`.trim() || m.user.email}`,
        }))}
        constraints={constraints.map((c) => ({
          id: c.id,
          memberId: c.memberId,
          memberLabel: `${`${c.member.user.firstName} ${c.member.user.lastName}`.trim() || c.member.user.email}`,
          date: (c.value as { date?: string })?.date ?? "",
          note: c.note,
        }))}
      />

      <div className="mt-4 d-flex flex-wrap gap-3 align-items-center">
        <Link href={`/${orgSlug}/${calId}/schedules/${schedId}/grid`} className="btn btn-success">
          Vai al configuratore →
        </Link>
        <Link href={`/${orgSlug}/turni`} className="turny-back-link">← Turni</Link>
      </div>
    </>
  );
}
