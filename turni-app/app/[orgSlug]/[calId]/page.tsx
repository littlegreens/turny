import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { AppBreadcrumbs } from "@/components/app-breadcrumbs";
import { CalendarMembersPanel } from "@/components/calendar-members-panel";
import { CalendarShiftTypesPanel } from "@/components/calendar-shift-types-panel";
import { CalendarCoRulesPanelV2 } from "@/components/calendar-co-rules-panel-v2";
import { authOptions } from "@/lib/auth";
import { parseProfessionalRoles } from "@/lib/professional-roles";
import { resolveMemberRowColor } from "@/lib/member-row-color";
import { FALLBACK_ORG_ADMIN_ROLES, hasAnyRole, normalizeRoles, type OrgRoleValue } from "@/lib/org-roles";
import { fetchOrgMemberDisplayColors } from "@/lib/org-member-display-colors";
import { prisma } from "@/lib/prisma";
import { isSuperAdminEmail } from "@/lib/super-admin";

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
  const superAdmin = isSuperAdminEmail(session.user.email ?? null);
  if (!membership && !superAdmin) {
    notFound();
  }
  const effectiveRoles: OrgRoleValue[] = membership
    ? normalizeRoles([membership.role, ...membership.roles])
    : FALLBACK_ORG_ADMIN_ROLES;
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
      include: {
        user: { select: { firstName: true, lastName: true, email: true, professionalRole: true } },
        constraints: { where: { type: "CUSTOM", note: "MEMBER_COLOR" }, select: { value: true } },
      },
      orderBy: { joinedAt: "asc" },
    }),
    prisma.orgMember.findMany({
      where: { orgId: calendar.orgId },
      include: { user: { select: { firstName: true, lastName: true, email: true } } },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    }),
  ]);
  const canEdit = hasAnyRole(effectiveRoles, ["OWNER", "ADMIN", "MANAGER"]);
  const userIds = [...new Set(orgMembers.map((m) => m.userId))];
  const orgDisplayRows = await fetchOrgMemberDisplayColors(calendar.orgId, userIds);
  const orgDisplayByUserId = new Map(orgDisplayRows.map((r) => [r.userId, r]));

  const userIdsInCalendar = new Set(calendarMembers.map((m) => m.userId));
  const availableForCalendar = orgMembers
    .filter((m) => !userIdsInCalendar.has(m.userId))
    .map((m) => ({
      userId: m.userId,
      label: `${`${m.user.firstName} ${m.user.lastName}`.trim() || m.user.email}`,
      email: m.user.email,
    }));

  const roleOptions = [
    ...new Set(
      calendarMembers
        .flatMap((m) => parseProfessionalRoles(m.user.professionalRole || ""))
        .map((r) => r.trim())
        .filter(Boolean),
    ),
  ].sort((a, b) => a.localeCompare(b, "it"));

  return (
    <>
      <AppBreadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Calendari", href: `/${orgSlug}/calendari` },
          { label: calendar.name },
        ]}
      />
      <h2 className="h2 mt-3 mb-1">{calendar.name}</h2>
      <p className="text-secondary mb-0">
        {calendar.description || "Nessuna descrizione"} · Timezone: {calendar.timezone}
      </p>

      <section className="card mt-3">
        <div className="card-body">
          <h3 className="mb-2">Fasce orarie</h3>
          <CalendarShiftTypesPanel calendarId={calendar.id} canEdit={canEdit} shiftTypes={shiftTypes} roleOptions={roleOptions} />
        </div>
      </section>

      <section className="card mt-3">
        <div className="card-body">
          <h3 className="mb-2">Persone</h3>
          <CalendarMembersPanel
            calId={calendar.id}
            canEdit={canEdit}
            assigned={calendarMembers.map((m) => ({
              calendarMemberId: m.id,
              userId: m.userId,
              label: `${`${m.user.firstName} ${m.user.lastName}`.trim() || m.user.email}`,
              email: m.user.email,
              professionalRole: m.user.professionalRole || "",
              memberColor: resolveMemberRowColor({
                calendarConstraintColor:
                  ((m.constraints.find((c) => (c.value as { color?: string } | undefined)?.color)?.value as { color?: string } | undefined)?.color ??
                    null),
                orgDefaultColor: orgDisplayByUserId.get(m.userId)?.defaultDisplayColor ?? null,
                orgUseDefaultInCalendars: orgDisplayByUserId.get(m.userId)?.useDisplayColorInCalendars ?? true,
              }),
            }))}
            available={availableForCalendar.map((u) => ({
              ...u,
              memberColor: resolveMemberRowColor({
                calendarConstraintColor: null,
                orgDefaultColor: orgDisplayByUserId.get(u.userId)?.defaultDisplayColor ?? null,
                orgUseDefaultInCalendars: orgDisplayByUserId.get(u.userId)?.useDisplayColorInCalendars ?? true,
              }),
            }))}
          />
        </div>
      </section>

      <section className="card mt-3">
        <div className="card-body">
          <h3 className="mb-2">Regole</h3>
          <CalendarCoRulesPanelV2
            calId={calendar.id}
            canEdit={canEdit}
            initialCalendarRules={calendar.rules}
            shiftTypes={shiftTypes.map((st) => ({ id: st.id, name: st.name }))}
            members={calendarMembers.map((m) => ({
              id: m.id,
              label: `${`${m.user.firstName} ${m.user.lastName}`.trim() || m.user.email}`,
              professionalRole: m.user.professionalRole || "",
              memberColor: null,
            }))}
          />
        </div>
      </section>

      <div className="mt-4">
        <Link href={`/${orgSlug}/calendari`} className="turny-back-link">← Calendari</Link>
      </div>
    </>
  );
}
