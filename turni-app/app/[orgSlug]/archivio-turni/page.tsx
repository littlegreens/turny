import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { AppBreadcrumbs } from "@/components/app-breadcrumbs";
import { ScheduleRipristinaButton } from "@/components/schedule-ripristina-button";
import { authOptions } from "@/lib/auth";
import { hasAnyRole, normalizeRoles } from "@/lib/org-roles";
import { prisma } from "@/lib/prisma";
import { isSuperAdminEmail } from "@/lib/super-admin";

type Props = {
  params: Promise<{ orgSlug: string }>;
};

export default async function OrgTurnsArchivePage({ params }: Props) {
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
  if (!hasAnyRole(roles, ["OWNER", "ADMIN", "MANAGER"])) {
    redirect(`/${org.slug}/turni`);
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
      status: "ARCHIVED",
      ...(isManagerOnly ? { calendarId: { in: assignedCalendarIds } } : {}),
    },
    include: { calendar: { select: { id: true, name: true } } },
    orderBy: [{ year: "desc" }, { month: "desc" }, { createdAt: "desc" }],
  });

  return (
    <>
      <AppBreadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Turni", href: `/${org.slug}/turni` },
          { label: "Archivio turni" },
        ]}
      />

      <h2 className="h2 fw-bold mt-3">Archivio turni</h2>
      <p className="text-secondary mb-0">Consulta i turni passati archiviati in sola lettura.</p>

      <section className="card mt-3">
        <div className="card-body">
          {schedules.length === 0 ? (
            <p className="text-secondary mb-0">Nessun turno archiviato.</p>
          ) : (
            <ul className="list-unstyled d-grid gap-2 mb-0">
              {schedules.map((s) => (
                <li key={s.id} className="border rounded p-2 d-flex justify-content-between align-items-center gap-2 flex-wrap">
                  <div>
                    <p className="fw-semibold mb-0">
                      {s.calendar.name} - {String(s.month).padStart(2, "0")}/{s.year}
                    </p>
                    <p className="small text-secondary mb-0">Stato: {s.status}</p>
                  </div>
                  <div className="d-flex gap-2 flex-wrap align-items-center">
                    <Link className="btn btn-sm btn-outline-secondary" href={`/${org.slug}/${s.calendar.id}/schedules/${s.id}/report`}>
                      Apri report
                    </Link>
                    <ScheduleRipristinaButton scheduleId={s.id} orgSlug={org.slug} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </>
  );
}

