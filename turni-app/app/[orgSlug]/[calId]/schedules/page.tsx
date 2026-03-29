import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { AppBreadcrumbs } from "@/components/app-breadcrumbs";
import { ScheduleListItem } from "@/components/schedule-list-item";
import { authOptions } from "@/lib/auth";
import { hasAnyRole, normalizeRoles } from "@/lib/org-roles";
import { prisma } from "@/lib/prisma";

type Props = {
  params: Promise<{ orgSlug: string; calId: string }>;
};

export default async function CalendarSchedulesPage({ params }: Props) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const { orgSlug, calId } = await params;
  const calendar = await prisma.calendar.findUnique({ where: { id: calId }, include: { org: true } });
  if (!calendar || calendar.org.slug !== orgSlug) notFound();

  const membership = await prisma.orgMember.findFirst({
    where: { userId: session.user.id, orgId: calendar.orgId },
  });
  if (!membership) notFound();
  const roles = normalizeRoles([membership.role, ...membership.roles]);
  if (!hasAnyRole(roles, ["OWNER", "ADMIN", "MANAGER"])) {
    redirect(`/${orgSlug}/turni`);
  }
  const isManagerOnly = hasAnyRole(roles, ["MANAGER"]) && !hasAnyRole(roles, ["OWNER", "ADMIN"]);
  if (isManagerOnly) {
    const assigned = await prisma.calendarMember.findUnique({
      where: { calendarId_userId: { calendarId: calendar.id, userId: session.user.id } },
    });
    if (!assigned) notFound();
  }

  const schedules = await prisma.schedule.findMany({
    where: { calendarId: calendar.id },
    orderBy: [{ year: "desc" }, { month: "desc" }, { createdAt: "desc" }],
  });

  return (
    <>
      <AppBreadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Turni", href: `/${orgSlug}/turni` },
          { label: calendar.name },
        ]}
      />

      <h2 className="h2 fw-bold mt-3">Turni mensili</h2>
      <p className="text-secondary mb-3">Crea e gestisci le bozze mese per {calendar.name}.</p>

      <section className="card mt-3">
        <div className="card-body">
          <h2 className="h5 fw-semibold">Schedule del calendario</h2>
          {schedules.length === 0 ? (
            <p className="text-secondary mb-0">Nessuna bozza creata.</p>
          ) : (
            <ul className="list-unstyled d-grid gap-2 mt-3">
              {schedules.map((schedule) => (
                <ScheduleListItem
                  key={schedule.id}
                  orgSlug={orgSlug}
                  calId={calendar.id}
                  schedule={{
                    id: schedule.id,
                    year: schedule.year,
                    month: schedule.month,
                    status: schedule.status,
                    generationLog: schedule.generationLog,
                  }}
                  canEdit={hasAnyRole(roles, ["OWNER", "ADMIN", "MANAGER"])}
                />
              ))}
            </ul>
          )}
        </div>
      </section>

      <div className="mt-4">
        <Link href={`/${orgSlug}/${calendar.id}`} className="link-dark">Torna al calendario</Link>
      </div>
    </>
  );
}
