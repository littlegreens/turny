import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { AppBreadcrumbs } from "@/components/app-breadcrumbs";
import { CalendarMembersPanel } from "@/components/calendar-members-panel";
import { CalendarShiftTypesPanel } from "@/components/calendar-shift-types-panel";
import { CalendarCustomRulesPanel } from "@/components/calendar-custom-rules-panel";
import { authOptions } from "@/lib/auth";
import { hasAnyRole, normalizeRoles } from "@/lib/org-roles";
import { prisma } from "@/lib/prisma";

type Props = {
  params: Promise<{ orgSlug: string; calId: string }>;
};

export default async function CalendarDetailPage({ params }: Props) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login");
  }

  const { orgSlug, calId } = await params;

  const calendar = await prisma.calendar.findUnique({
    where: { id: calId },
    include: { org: true },
  });

  if (!calendar || calendar.org.slug !== orgSlug) {
    notFound();
  }

  const membership = await prisma.orgMember.findFirst({
    where: {
      userId: session.user.id,
      orgId: calendar.orgId,
    },
  });
  if (!membership) {
    notFound();
  }
  const effectiveRoles = normalizeRoles([membership.role, ...membership.roles]);
  if (!hasAnyRole(effectiveRoles, ["OWNER", "ADMIN", "MANAGER"])) {
    redirect(`/${orgSlug}/turni`);
  }
  const isManagerOnly = hasAnyRole(effectiveRoles, ["MANAGER"]) && !hasAnyRole(effectiveRoles, ["OWNER", "ADMIN"]);
  if (isManagerOnly) {
    const access = await prisma.calendarMember.findUnique({
      where: { calendarId_userId: { calendarId: calendar.id, userId: session.user.id } },
    });
    if (!access) notFound();
  }

  const [shiftTypes, calendarMembers, orgMembers] = await Promise.all([
    prisma.shiftType.findMany({
      where: { calendarId: calendar.id },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    }),
    prisma.calendarMember.findMany({
      where: { calendarId: calendar.id },
      include: { user: { select: { firstName: true, lastName: true, email: true, professionalRole: true } } },
      orderBy: { joinedAt: "asc" },
    }),
    prisma.orgMember.findMany({
      where: { orgId: calendar.orgId },
      include: { user: { select: { firstName: true, lastName: true, email: true } } },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    }),
  ]);
  const canEdit = hasAnyRole(effectiveRoles, ["OWNER", "ADMIN", "MANAGER"]);

  const userIdsInCalendar = new Set(calendarMembers.map((m) => m.userId));
  const availableForCalendar = orgMembers
    .filter((m) => !userIdsInCalendar.has(m.userId))
    .map((m) => ({
      userId: m.userId,
      label: `${`${m.user.firstName} ${m.user.lastName}`.trim() || m.user.email}`,
      email: m.user.email,
    }));

  return (
    <>
      <AppBreadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Calendari", href: `/${orgSlug}` },
          { label: calendar.name },
        ]}
      />
      <h2 className="h2 fw-bold mt-3 mb-1">Calendario: {calendar.name}</h2>
      <p className="text-secondary mb-3">
        {calendar.description || "Nessuna descrizione"} - {calendar.timezone}
      </p>
      <section className="card mt-3">
        <div className="card-body">
          <CalendarShiftTypesPanel calendarId={calendar.id} canEdit={canEdit} shiftTypes={shiftTypes} />
        </div>
      </section>

      <section className="card mt-3">
        <div className="card-body">
          <h2 className="h5 fw-semibold mb-2">Persone nel calendario</h2>
          <CalendarMembersPanel
            calId={calendar.id}
            canEdit={canEdit}
            assigned={calendarMembers.map((m) => ({
              calendarMemberId: m.id,
              userId: m.userId,
              label: `${`${m.user.firstName} ${m.user.lastName}`.trim() || m.user.email}`,
              email: m.user.email,
              professionalRole: m.user.professionalRole || "",
            }))}
            available={availableForCalendar}
          />
        </div>
      </section>

      <CalendarCustomRulesPanel calId={calendar.id} initialCustomRules={calendar.customRules} canEdit={canEdit} />

      <div className="mt-4">
        <Link href={`/${orgSlug}`} className="link-dark">
          Torna ai calendari
        </Link>
      </div>
      <footer className="small text-secondary mt-4 pt-2 border-top">
        Turny - gestione turni
      </footer>
    </>
  );
}
