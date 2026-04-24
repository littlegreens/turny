import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { AppBreadcrumbs } from "@/components/app-breadcrumbs";
import { authOptions } from "@/lib/auth";
import { FALLBACK_ORG_ADMIN_ROLES, hasAnyRole, normalizeRoles } from "@/lib/org-roles";
import { prisma } from "@/lib/prisma";
import { isSuperAdminEmail } from "@/lib/super-admin";

type Props = {
  params: Promise<{ orgSlug: string }>;
};

export default async function OrgDashboardPage({ params }: Props) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login");
  }

  const { orgSlug } = await params;

  const membership = await prisma.orgMember.findFirst({
    where: {
      userId: session.user.id,
      org: { slug: orgSlug },
    },
    include: {
      org: true,
    },
  });

  const superAdmin = isSuperAdminEmail(session.user.email ?? null);
  if (!membership && !superAdmin) {
    notFound();
  }
  const org = membership?.org ?? (await prisma.organization.findUnique({ where: { slug: orgSlug } }));
  if (!org) notFound();

  const effectiveRoles = membership ? normalizeRoles([membership.role, ...membership.roles]) : FALLBACK_ORG_ADMIN_ROLES;
  const isWorkerOnly = !hasAnyRole(effectiveRoles, ["OWNER", "ADMIN", "MANAGER"]);
  if (isWorkerOnly) {
    redirect(`/${org.slug}/turni`);
  }
  const isManagerOnly = hasAnyRole(effectiveRoles, ["MANAGER"]) && !hasAnyRole(effectiveRoles, ["OWNER", "ADMIN"]);
  const assignedCalendarIds = isManagerOnly
    ? (
        await prisma.calendarMember.findMany({
          where: { userId: session.user.id, calendar: { orgId: org.id } },
          select: { calendarId: true },
        })
      ).map((item) => item.calendarId)
    : [];

  const visibleCalendarWhere = isManagerOnly
    ? { orgId: org.id, id: { in: assignedCalendarIds.length ? assignedCalendarIds : ["__none__"] } }
    : { orgId: org.id };

  const [calendarCount, scheduleCount, publishedCount, activeMembers] = await Promise.all([
    prisma.calendar.count({ where: visibleCalendarWhere }),
    prisma.schedule.count({ where: { calendar: visibleCalendarWhere } }),
    prisma.schedule.count({ where: { calendar: visibleCalendarWhere, status: "PUBLISHED" } }),
    prisma.orgMember.count({ where: { orgId: org.id } }),
  ]);

  return (
    <>
      <AppBreadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Dashboard" },
        ]}
      />
      <h2 className="h2 mt-3">Dashboard</h2>
      <p className="text-secondary mb-3">{org.name} — Panoramica rapida.</p>

      <div className="row g-3">
        {[
          { label: "Calendari", value: calendarCount },
          { label: "Turni creati", value: scheduleCount },
          { label: "Turni pubblicati", value: publishedCount },
          { label: "Persone attive", value: activeMembers },
        ].map((item) => (
          <div key={item.label} className="col-6 col-md-3">
            <div
              className="card h-100 border-0 text-white shadow-sm"
              style={{ background: "linear-gradient(135deg, #1f7a3f 0%, #2e9c56 100%)", minHeight: 132 }}
            >
              <div className="card-body d-flex flex-column justify-content-between">
                <div className="small" style={{ opacity: 0.9 }}>{item.label}</div>
                <div className="display-5 fw-bold mb-0 text-white">{item.value}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="card mt-3">
        <div className="card-body d-flex flex-wrap gap-2">
          <a href={`/${org.slug}/calendari`} className="btn btn-success">Vai ai calendari</a>
          <a href={`/${org.slug}/turni`} className="btn btn-outline-secondary">Vai ai turni</a>
          <a href={`/${org.slug}/members`} className="btn btn-outline-secondary">Vai alle persone</a>
          <a href={`/${org.slug}/settings`} className="btn btn-outline-secondary">Vai alle impostazioni</a>
        </div>
      </div>
    </>
  );
}
