import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { AppBreadcrumbs } from "@/components/app-breadcrumbs";
import { ScheduleRipristinaButton } from "@/components/schedule-ripristina-button";
import { authOptions } from "@/lib/auth";
import { FALLBACK_ORG_ADMIN_ROLES, hasAnyRole, normalizeRoles, type OrgRoleValue } from "@/lib/org-roles";
import { prisma } from "@/lib/prisma";
import { isSuperAdminEmail } from "@/lib/super-admin";

type Props = {
  params: Promise<{ orgSlug: string }>;
};

function monthName(month: number) {
  const monthLabel = new Intl.DateTimeFormat("it-IT", { month: "long" }).format(new Date(2026, month - 1, 1));
  return monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);
}

function formatDateIt(isoDate: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return isoDate || "-";
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
}

function colorWithAlpha(hex: string, alphaHex = "1f") {
  return /^#[0-9A-Fa-f]{6}$/.test(hex) ? `${hex}${alphaHex}` : "#1f7a3f1f";
}

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

  const roles: OrgRoleValue[] = membership
    ? normalizeRoles([membership.role, ...membership.roles])
    : FALLBACK_ORG_ADMIN_ROLES;
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
    include: { calendar: { select: { id: true, name: true, color: true } } },
    orderBy: [{ year: "desc" }, { month: "desc" }, { createdAt: "desc" }],
  });

  const groupedByCalendar = new Map<string, typeof schedules>();
  for (const item of schedules) {
    const key = item.calendar.id;
    if (!groupedByCalendar.has(key)) groupedByCalendar.set(key, []);
    groupedByCalendar.get(key)!.push(item);
  }

  return (
    <>
      <AppBreadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Turni", href: `/${org.slug}/turni` },
          { label: "Archivio turni" },
        ]}
      />

      <h2 className="h2 mt-3">Archivio turni</h2>
      <p className="text-secondary mb-0">Consulta i piani turni passati in sola lettura.</p>

      <section className="card mt-3">
        <div className="card-body">
          {schedules.length === 0 ? (
            <div className="border rounded p-4 text-center" role="status">
              <p className="fw-semibold mb-1">Nessun piano turni archiviato</p>
              <p className="small text-secondary mb-0">I piani turni scaduti vengono archiviati automaticamente.</p>
            </div>
          ) : (
            <div className="d-grid gap-3">
              {[...groupedByCalendar.entries()].map(([calendarId, rows]) => (
                <div key={calendarId}>
                  <h3 className="mb-2">{rows[0].calendar.name}</h3>
                  <ul className="list-unstyled d-grid gap-2 mb-0">
                    {rows.map((s) => {
                      const meta = (s.generationLog ?? {}) as { periodType?: string; startDate?: string; endDate?: string; turnName?: string };
                      const periodText =
                        meta.periodType === "WEEKLY" || meta.periodType === "CUSTOM"
                          ? `Dal ${formatDateIt(meta.startDate ?? "")} al ${formatDateIt(meta.endDate ?? "")}`
                          : monthName(s.month);
                      return (
                        <li
                          key={s.id}
                          className="rounded p-3 d-flex justify-content-between align-items-center gap-2 flex-wrap"
                          style={{ border: `1px solid ${s.calendar.color}`, backgroundColor: colorWithAlpha(s.calendar.color) }}
                        >
                          <div>
                            <p className="fw-semibold mb-0">{meta.turnName?.trim() || "Turno senza nome"}</p>
                            <p className="small text-secondary mb-0">Periodo: {periodText}</p>
                            <p className="small text-secondary mb-0">Stato: Archiviato</p>
                          </div>
                          <div className="d-flex gap-2 flex-wrap align-items-center">
                            <Link className="btn btn-sm btn-outline-secondary" href={`/${org.slug}/${s.calendar.id}/schedules/${s.id}/report`}>
                              Apri report
                            </Link>
                            <ScheduleRipristinaButton scheduleId={s.id} orgSlug={org.slug} />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}

