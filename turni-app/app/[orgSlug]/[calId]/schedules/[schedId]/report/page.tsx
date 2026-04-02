import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { AppBreadcrumbs } from "@/components/app-breadcrumbs";
import { ScheduleReportActions } from "@/components/schedule-report-actions";
import { ScheduleReportCsvButton } from "@/components/schedule-report-csv-button";
import { authOptions } from "@/lib/auth";
import { hasAnyRole, normalizeRoles } from "@/lib/org-roles";
import { parseHolidayOverrides } from "@/lib/holiday-overrides";
import { buildScheduleReport } from "@/lib/schedule-report";
import { shiftIsNight } from "@/lib/scheduler-problem";
import { prisma } from "@/lib/prisma";

type Props = {
  params: Promise<{ orgSlug: string; calId: string; schedId: string }>;
};

function formatDateItLong(iso: string) {
  return new Intl.DateTimeFormat("it-IT").format(new Date(`${iso}T00:00:00.000Z`));
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
      select: { memberId: true, guestLabel: true, guestColor: true, shiftTypeId: true, date: true },
    }),
  ]);

  const holidayOverridesMerged = (() => {
    const m = new Map<string, unknown>();
    for (const h of parseHolidayOverrides(schedule.calendar.rules)) m.set(h.date, h);
    for (const h of parseHolidayOverrides(schedule.rules)) m.set(h.date, h);
    return [...m.values()];
  })();

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
      ...(a.memberId ? { memberId: a.memberId } : {}),
      guestLabel: a.guestLabel,
      guestColor: a.guestColor,
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
    holidayOverrides: holidayOverridesMerged as any,
  });

  const coverageUnder = report.coverageAlerts.filter((a) => a.kind === "UNDERSTAFFED");
  const coverageOver = report.coverageAlerts.filter((a) => a.kind === "OVERSTAFFED");

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
            {report.extraRows.length > 0 ? (
              <div className="mt-4">
                <h3 className="h6 fw-semibold mb-2">Persone extra (non in anagrafica)</h3>
                <p className="small text-secondary mb-2">
                  Coperture aggiunte manualmente sulla griglia senza scheda membro calendario.
                </p>
                <div className="table-responsive">
                  <table className="table table-sm table-bordered mb-0">
                    <thead>
                      <tr>
                        <th>Nome</th>
                        <th className="text-end">Turni</th>
                        <th className="text-end">Ore</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.extraRows.map((r) => (
                        <tr key={r.key}>
                          <td>
                            <span
                              className="fw-semibold"
                              style={r.color ? { color: r.color } : undefined}
                            >
                              {r.label}
                            </span>
                          </td>
                          <td className="text-end">{r.shiftCount}</td>
                          <td className="text-end">{r.hoursTotal}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
            <p className="small text-secondary mt-2 mb-0">
              Le ore sono la somma delle durate dei tipi turno assegnati (come da configurazione calendario).
            </p>
          </div>
        </section>

        <section className="card mt-3">
          <div className="card-body">
            <h2 className="h6 fw-semibold mb-2">Copertura</h2>
            <p className="small text-secondary mb-3">
              Slot sotto il minimo o sopra il massimo organico configurato per tipo turno.
            </p>
            {coverageUnder.length === 0 && coverageOver.length === 0 ? (
              <p className="text-secondary small mb-0">Nessun problema: tutte le celle attive rispettano min e max.</p>
            ) : (
              <div className="d-grid gap-3">
                {coverageUnder.length > 0 ? (
                  <div className="alert alert-danger border border-danger mb-0" role="status">
                    <div className="fw-semibold">Sotto il minimo organico</div>
                    <p className="small mb-2 text-secondary">Meno persone del minimo richiesto per quella fascia.</p>
                    <div className="small" style={{ maxHeight: 360, overflowY: "auto" }}>
                      <ul className="mb-0 ps-3">
                        {coverageUnder.map((a, i) => (
                          <li key={`under-${a.date}-${a.shiftTypeId}-${i}`}>
                            <strong>{formatDateItLong(a.date)}</strong> · {a.shiftName}: {a.count}/{a.minStaff} persone
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ) : null}
                {coverageOver.length > 0 ? (
                  <div className="alert alert-warning border border-warning mb-0" role="status">
                    <div className="fw-semibold">Sopra il massimo organico</div>
                    <p className="small mb-2 text-secondary">Troppe persone sullo stesso slot.</p>
                    <div className="small" style={{ maxHeight: 280, overflowY: "auto" }}>
                      <ul className="mb-0 ps-3">
                        {coverageOver.map((a, i) => (
                          <li key={`over-${a.date}-${a.shiftTypeId}-${i}`}>
                            <strong>{formatDateItLong(a.date)}</strong> · {a.shiftName}: {a.count} persone
                            {a.maxStaff != null ? ` (massimo ${a.maxStaff})` : ""}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ) : null}
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
