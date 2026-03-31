import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { AppBreadcrumbs } from "@/components/app-breadcrumbs";
import { ScheduleReportActions } from "@/components/schedule-report-actions";
import { ScheduleReportCsvButton } from "@/components/schedule-report-csv-button";
import { authOptions } from "@/lib/auth";
import { hasAnyRole, normalizeRoles } from "@/lib/org-roles";
import { buildScheduleReport } from "@/lib/schedule-report";
import { shiftIsNight } from "@/lib/scheduler-problem";
import { prisma } from "@/lib/prisma";

type Props = {
  params: Promise<{ orgSlug: string; calId: string; schedId: string }>;
};

function formatItDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("it-IT", { weekday: "short", day: "2-digit", month: "2-digit" });
}

export default async function ScheduleReportPage({ params }: Props) {
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

  const [shiftTypes, calendarMembers, assignments] = await Promise.all([
    prisma.shiftType.findMany({
      where: { calendarId: schedule.calendarId, isActive: true },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    }),
    prisma.calendarMember.findMany({
      where: { calendarId: schedule.calendarId, isActive: true },
      include: { user: { select: { firstName: true, lastName: true, email: true, professionalRole: true } } },
      orderBy: { joinedAt: "asc" },
    }),
    prisma.shiftAssignment.findMany({
      where: { scheduleId: schedule.id },
      select: { memberId: true, shiftTypeId: true, date: true },
    }),
  ]);

  const report = buildScheduleReport({
    year: schedule.year,
    month: schedule.month,
    shiftTypes: shiftTypes.map((st) => ({
      id: st.id,
      name: st.name,
      minStaff: st.minStaff,
      maxStaff: st.maxStaff,
      durationHours: st.durationHours,
      activeWeekdays: st.activeWeekdays,
      isNight: shiftIsNight(st),
    })),
    assignments: assignments.map((a) => ({
      memberId: a.memberId,
      shiftTypeId: a.shiftTypeId,
      date: a.date.toISOString().slice(0, 10),
    })),
    members: calendarMembers.map((m) => ({
      id: m.id,
      label: `${`${m.user.firstName} ${m.user.lastName}`.trim() || m.user.email}`,
      email: m.user.email,
      professionalRole: m.user.professionalRole || "",
      contractMode: m.contractMode,
    })),
  });

  const canEditLifecycle = hasAnyRole(roles, ["OWNER", "ADMIN", "MANAGER"]);
  const csvFilename = `turni-${schedule.year}-${String(schedule.month).padStart(2, "0")}-${schedule.calendar.name.replace(/\s+/g, "-")}.csv`;

  return (
    <>
      <AppBreadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Turni", href: `/${orgSlug}/turni` },
          { label: "Report" },
        ]}
      />

        <div className="d-flex flex-wrap justify-content-between align-items-start gap-3 mt-3">
          <div>
            <h2 className="h2 mt-3 mb-1">
              Report mese — {String(schedule.month).padStart(2, "0")}/{schedule.year}
            </h2>
            <p className="text-secondary mb-0">
              Stato: <strong>{schedule.status}</strong> — {schedule.calendar.name}
            </p>
          </div>
          <div className="d-flex flex-wrap gap-2 align-items-center">
            <ScheduleReportCsvButton
              filename={csvFilename}
              rows={report.memberRows.map((r) => ({
                label: r.label,
                email: r.email,
                professionalRole: r.professionalRole,
                shiftCount: r.shiftCount,
                nightCount: r.nightCount,
                satCount: r.satCount,
                sunCount: r.sunCount,
                hoursTotal: r.hoursTotal,
                contractMode: r.contractMode,
              }))}
            />
            <ScheduleReportActions scheduleId={schedule.id} canEdit={canEditLifecycle} status={schedule.status} />
          </div>
        </div>

        <section className="row g-3 mt-2">
          <div className="col-md-4">
            <div className="border rounded p-3 h-100">
              <p className="small text-secondary mb-1">Assegnazioni totali</p>
              <p className="h4 fw-bold mb-0">{report.totals.assignments}</p>
            </div>
          </div>
          <div className="col-md-4">
            <div className="border rounded p-3 h-100">
              <p className="small text-secondary mb-1">Ore coperte (stimato)</p>
              <p className="h4 fw-bold mb-0">{report.totals.hours}</p>
            </div>
          </div>
          <div className="col-md-4">
            <div className="border rounded p-3 h-100">
              <p className="small text-secondary mb-1">Slot giorno×turno controllati</p>
              <p className="h4 fw-bold mb-0">{report.totals.shiftSlotsChecked}</p>
            </div>
          </div>
        </section>

        <section className="card mt-3">
          <div className="card-body">
            <h2 className="h6 fw-semibold mb-2">Riepilogo per persona</h2>
            <div className="table-responsive">
              <table className="table table-sm table-bordered mb-0">
                <thead>
                  <tr>
                    <th>Persona</th>
                    <th>Email</th>
                    <th>Ruolo prof.</th>
                    <th className="text-end">Turni</th>
                    <th className="text-end">Notti</th>
                    <th className="text-end">Sabati</th>
                    <th className="text-end">Domeniche</th>
                    <th className="text-end">Ore</th>
                    <th>Contratto</th>
                  </tr>
                </thead>
                <tbody>
                  {report.memberRows.map((r) => (
                    <tr key={r.memberId}>
                      <td>{r.label}</td>
                      <td className="small">{r.email}</td>
                      <td className="small">{r.professionalRole || "—"}</td>
                      <td className="text-end">{r.shiftCount}</td>
                      <td className="text-end">{r.nightCount > 0 ? r.nightCount : "—"}</td>
                      <td className="text-end">{r.satCount > 0 ? r.satCount : "—"}</td>
                      <td className="text-end">{r.sunCount > 0 ? r.sunCount : "—"}</td>
                      <td className="text-end">{r.hoursTotal}</td>
                      <td className="small">{r.contractMode}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="small text-secondary mt-2 mb-0">
              Le ore sono la somma delle durate dei tipi turno assegnati (come da configurazione calendario).
            </p>
          </div>
        </section>

        <section className="card mt-3">
          <div className="card-body">
            <h2 className="h6 fw-semibold mb-2">Copertura min/max staff</h2>
            {report.coverageAlerts.length === 0 ? (
              <p className="text-secondary small mb-0">Nessun alert: tutte le celle attive rispettano min/max.</p>
            ) : (
              <div className="table-responsive">
                <table className="table table-sm table-bordered mb-0">
                  <thead>
                    <tr>
                      <th>Tipo</th>
                      <th>Data</th>
                      <th>Turno</th>
                      <th className="text-end">Assegnati</th>
                      <th className="text-end">Min</th>
                      <th className="text-end">Max</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.coverageAlerts.map((a, i) => (
                      <tr key={`${a.date}-${a.shiftTypeId}-${a.kind}-${i}`}>
                        <td>
                          {a.kind === "UNDERSTAFFED" ? (
                            <span className="text-danger">Sottocopertura</span>
                          ) : (
                            <span className="text-warning">Sovraffollamento</span>
                          )}
                        </td>
                        <td>{formatItDate(a.date)}</td>
                        <td>{a.shiftName}</td>
                        <td className="text-end">{a.count}</td>
                        <td className="text-end">{a.minStaff}</td>
                        <td className="text-end">{a.maxStaff ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

      <div className="mt-4">
        <Link href={`/${orgSlug}/turni`} className="turny-back-link">← Turni</Link>
      </div>
    </>
  );
}
