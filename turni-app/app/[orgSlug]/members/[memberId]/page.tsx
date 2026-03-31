import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { AppBreadcrumbs } from "@/components/app-breadcrumbs";
import { OrgMemberItem } from "@/components/org-member-item";
import { authOptions } from "@/lib/auth";
import { hasAnyRole, normalizeRoles } from "@/lib/org-roles";
import { fetchOrgMemberDisplayColors } from "@/lib/org-member-display-colors";
import { distinctProfessionalRolesFromMembers } from "@/lib/org-professional-roles";
import { prisma } from "@/lib/prisma";
import { isSuperAdminEmail } from "@/lib/super-admin";

type Props = {
  params: Promise<{ orgSlug: string; memberId: string }>;
};

export default async function MemberDetailPage({ params }: Props) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const { orgSlug, memberId } = await params;

  const membership = await prisma.orgMember.findFirst({
    where: { userId: session.user.id, org: { slug: orgSlug } },
    include: { org: true },
  });
  const superAdmin = isSuperAdminEmail(session.user.email ?? null);
  if (!membership && !superAdmin) notFound();
  const orgId = membership?.orgId ?? (await prisma.organization.findUnique({ where: { slug: orgSlug }, select: { id: true } }))?.id;
  if (!orgId) notFound();

  const effectiveRoles = membership ? normalizeRoles([membership.role, ...membership.roles]) : ["OWNER", "ADMIN"];
  if (!hasAnyRole(effectiveRoles, ["OWNER", "ADMIN", "MANAGER"])) {
    redirect(`/${orgSlug}/turni`);
  }

  const member = await prisma.orgMember.findUnique({
    where: { id: memberId },
    include: { user: { select: { id: true, email: true, name: true, firstName: true, lastName: true, professionalRole: true } } },
  });
  if (!member || member.orgId !== orgId) notFound();

  const allMembers = await prisma.orgMember.findMany({
    where: { orgId },
    include: { user: { select: { id: true, email: true, name: true, firstName: true, lastName: true, professionalRole: true } } },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
  });

  const allCalendars = await prisma.calendar.findMany({
    where: { orgId },
    select: { id: true, name: true, color: true },
    orderBy: { createdAt: "asc" },
  });

  const orgColorByUserId = new Map(
    (
      await fetchOrgMemberDisplayColors(orgId, [member.userId])
    ).map((r) => [r.userId, r]),
  );

  const calendarMemberships = await prisma.calendarMember.findMany({
    where: { calendar: { orgId }, userId: member.userId },
    select: {
      id: true,
      userId: true,
      calendarId: true,
      contractShiftsMonth: true,
      contractHoursMonth: true,
      constraints: {
        where: {
          OR: [
            { type: "UNAVAILABLE_SHIFT", weight: "SOFT" },
            { type: "UNAVAILABLE_WEEKDAY", weight: "SOFT" },
            { type: "CUSTOM", note: "TARGET_SHIFTS_MONTH" },
            { type: "CUSTOM", note: "TARGET_HOURS_MONTH" },
            { type: "CUSTOM", note: "TARGET_NIGHTS_MONTH" },
            { type: "CUSTOM", note: "TARGET_SATURDAYS_MONTH" },
            { type: "CUSTOM", note: "TARGET_SUNDAYS_MONTH" },
          ],
        },
        select: { type: true, value: true, note: true },
      },
      calendar: {
        select: {
          name: true,
          color: true,
          shiftTypes: { where: { isActive: true }, orderBy: [{ order: "asc" }, { createdAt: "asc" }], select: { id: true, name: true } },
        },
      },
    },
  });

  const assignedCalendars = calendarMemberships.map((item) => {
    const avoidShiftTypeIds = item.constraints
      .filter((c) => c.type === "UNAVAILABLE_SHIFT")
      .map((c) => String((c.value as { shiftTypeId?: string } | undefined)?.shiftTypeId ?? ""))
      .filter(Boolean);
    const targetShifts = item.constraints.find((c) => c.type === "CUSTOM" && c.note === "TARGET_SHIFTS_MONTH");
    const targetHours = item.constraints.find((c) => c.type === "CUSTOM" && c.note === "TARGET_HOURS_MONTH");
    const targetNights = item.constraints.find((c) => c.type === "CUSTOM" && c.note === "TARGET_NIGHTS_MONTH");
    const targetSaturdays = item.constraints.find((c) => c.type === "CUSTOM" && c.note === "TARGET_SATURDAYS_MONTH");
    const targetSundays = item.constraints.find((c) => c.type === "CUSTOM" && c.note === "TARGET_SUNDAYS_MONTH");
    const avoidWeekdays = item.constraints
      .filter((c) => c.type === "UNAVAILABLE_WEEKDAY")
      .map((c) => Number((c.value as { weekday?: number }).weekday))
      .filter((n) => !Number.isNaN(n));
    const targetShiftsFromConstraint =
      typeof (targetShifts?.value as { shifts?: unknown } | undefined)?.shifts === "number"
        ? Number((targetShifts?.value as { shifts?: number }).shifts)
        : null;
    const targetHoursFromConstraint =
      typeof (targetHours?.value as { hours?: unknown } | undefined)?.hours === "number"
        ? Number((targetHours?.value as { hours?: number }).hours)
        : null;
    const hoursFromColumn =
      item.contractHoursMonth != null && Number.isFinite(item.contractHoursMonth)
        ? Math.round(item.contractHoursMonth)
        : null;
    return {
      id: item.calendarId,
      name: item.calendar.name,
      color: item.calendar.color,
      calendarMemberId: item.id,
      shiftTypes: item.calendar.shiftTypes,
      initialAvoidShiftTypeIds: [...new Set(avoidShiftTypeIds)],
      initialTargetShiftsMonth: targetShiftsFromConstraint ?? item.contractShiftsMonth ?? null,
      initialTargetHoursMonth: targetHoursFromConstraint ?? hoursFromColumn ?? null,
      initialTargetNightsMonth:
        typeof (targetNights?.value as { nights?: unknown } | undefined)?.nights === "number"
          ? Number((targetNights?.value as { nights?: number }).nights)
          : null,
      initialTargetSaturdaysMonth:
        typeof (targetSaturdays?.value as { saturdays?: unknown } | undefined)?.saturdays === "number"
          ? Number((targetSaturdays?.value as { saturdays?: number }).saturdays)
          : null,
      initialTargetSundaysMonth:
        typeof (targetSundays?.value as { sundays?: unknown } | undefined)?.sundays === "number"
          ? Number((targetSundays?.value as { sundays?: number }).sundays)
          : null,
      initialAvoidWeekdays: [...new Set(avoidWeekdays)],
    };
  });

  const canManage = effectiveRoles.some((r) => ["OWNER", "ADMIN", "MANAGER"].includes(r));
  const canEditRole = canManage;
  const canAssignAdmin = effectiveRoles.some((r) => ["OWNER", "ADMIN"].includes(r));
  const professionalRoleSuggestions = distinctProfessionalRolesFromMembers(allMembers);
  const displayName = `${member.user.firstName} ${member.user.lastName}`.trim() || member.user.email;

  return (
    <>
      <AppBreadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Persone", href: `/${orgSlug}/members` },
          { label: displayName },
        ]}
      />

      <h2 className="h2 mt-3">{displayName}</h2>
      <p className="text-secondary mb-3">
        {member.user.email} · {(member.roles.length ? member.roles : [member.role]).join(", ")}
      </p>

      <OrgMemberItem
        member={{
          id: member.id,
          role: member.role,
          roles: member.roles,
          userId: member.userId,
          defaultDisplayColor: orgColorByUserId.get(member.userId)?.defaultDisplayColor ?? null,
          useDisplayColorInCalendars: orgColorByUserId.get(member.userId)?.useDisplayColorInCalendars ?? true,
          user: {
            email: member.user.email,
            name: member.user.name,
            firstName: member.user.firstName,
            lastName: member.user.lastName,
            professionalRole: member.user.professionalRole,
          },
        }}
        myUserId={session.user.id}
        canEditRole={canEditRole}
        canRemove={canManage}
        canAssignAdmin={canAssignAdmin}
        allCalendars={allCalendars}
        assignedCalendars={assignedCalendars}
        professionalRoleSuggestions={professionalRoleSuggestions}
        pageMode
      />
      <div className="mt-4">
        <Link href={`/${orgSlug}/members`} className="turny-back-link">← Persone</Link>
      </div>
    </>
  );
}
