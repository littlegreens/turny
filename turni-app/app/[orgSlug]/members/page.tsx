import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { AppBreadcrumbs } from "@/components/app-breadcrumbs";
import { OrgMembersBoard } from "@/components/org-members-board";
import { authOptions } from "@/lib/auth";
import { hasAnyRole, normalizeRoles } from "@/lib/org-roles";
import { fetchOrgMemberDisplayColors } from "@/lib/org-member-display-colors";
import { distinctProfessionalRolesFromMembers } from "@/lib/org-professional-roles";
import { prisma } from "@/lib/prisma";

type Props = {
  params: Promise<{ orgSlug: string }>;
};

export default async function OrgMembersPage({ params }: Props) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const { orgSlug } = await params;
  const membership = await prisma.orgMember.findFirst({
    where: { userId: session.user.id, org: { slug: orgSlug } },
    include: { org: true },
  });
  if (!membership) notFound();

  const members = await prisma.orgMember.findMany({
    where: { orgId: membership.orgId },
    include: { user: { select: { id: true, email: true, name: true, firstName: true, lastName: true, professionalRole: true } } },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
  });
  const orgColorByUserId = new Map(
    (
      await fetchOrgMemberDisplayColors(
        membership.orgId,
        members.map((m) => m.userId),
      )
    ).map((r) => [r.userId, r]),
  );
  const calendarMemberships = await prisma.calendarMember.findMany({
    where: { calendar: { orgId: membership.orgId } },
    select: {
      id: true,
      userId: true,
      calendarId: true,
      contractShiftsWeek: true,
      contractHoursMonth: true,
      constraints: {
        where: {
          OR: [
            { type: "UNAVAILABLE_SHIFT", weight: "SOFT" },
            { type: "UNAVAILABLE_WEEKDAY", weight: "SOFT" },
            { type: "CUSTOM", note: "TARGET_SHIFTS_WEEK" },
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
  const calendarsByUser = calendarMemberships.reduce<Record<string, {
    id: string;
    name: string;
    color: string | null;
    calendarMemberId: string;
    shiftTypes: { id: string; name: string }[];
    initialAvoidShiftTypeIds: string[];
    initialTargetShiftsWeek: number | null;
    initialTargetHoursMonth: number | null;
    initialTargetNightsMonth: number | null;
    initialTargetSaturdaysMonth: number | null;
    initialTargetSundaysMonth: number | null;
    initialAvoidWeekdays: number[];
  }[]>>((acc, item) => {
    if (!acc[item.userId]) acc[item.userId] = [];
    const avoidShiftTypeIds = item.constraints
      .filter((c) => c.type === "UNAVAILABLE_SHIFT")
      .map((c) => String((c.value as { shiftTypeId?: string } | undefined)?.shiftTypeId ?? ""))
      .filter(Boolean);
    const targetShifts = item.constraints.find((c) => c.type === "CUSTOM" && c.note === "TARGET_SHIFTS_WEEK");
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
    acc[item.userId].push({
      id: item.calendarId,
      name: item.calendar.name,
      color: item.calendar.color,
      calendarMemberId: item.id,
      shiftTypes: item.calendar.shiftTypes,
      initialAvoidShiftTypeIds: [...new Set(avoidShiftTypeIds)],
      initialTargetShiftsWeek: targetShiftsFromConstraint ?? item.contractShiftsWeek ?? null,
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
    });
    return acc;
  }, {});

  const effectiveRoles = normalizeRoles([membership.role, ...membership.roles]);
  if (!hasAnyRole(effectiveRoles, ["OWNER", "ADMIN", "MANAGER"])) {
    redirect(`/${membership.org.slug}/turni`);
  }
  const canManage = effectiveRoles.some((r) => ["OWNER", "ADMIN", "MANAGER"].includes(r));
  const canEditRole = effectiveRoles.some((r) => ["OWNER", "ADMIN", "MANAGER"].includes(r));
  const canAssignAdmin = effectiveRoles.some((r) => ["OWNER", "ADMIN"].includes(r));

  const professionalRoleSuggestions = distinctProfessionalRolesFromMembers(members);

  return (
    <>
      <AppBreadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Membri" },
        ]}
      />

      <h2 className="h2 fw-bold mt-3">Membri</h2>
      <p className="text-secondary mb-0">
        Gestisci ruoli e persone dell&apos;organizzazione; l&apos;abbinamento ai singoli calendari resta nella pagina di ciascun calendario.
      </p>

      <OrgMembersBoard
        orgSlug={membership.org.slug}
        myUserId={session.user.id}
        professionalRoleSuggestions={professionalRoleSuggestions}
        members={members.map((item) => ({
          id: item.id,
          role: item.role,
          roles: item.roles,
          userId: item.userId,
          defaultDisplayColor: orgColorByUserId.get(item.userId)?.defaultDisplayColor ?? null,
          useDisplayColorInCalendars: orgColorByUserId.get(item.userId)?.useDisplayColorInCalendars ?? true,
          user: {
            email: item.user.email,
            name: item.user.name,
            firstName: item.user.firstName,
            lastName: item.user.lastName,
            professionalRole: item.user.professionalRole,
          },
        }))}
        canManage={canManage}
        canEditRole={canEditRole}
        canAssignAdmin={canAssignAdmin}
        calendarsByUser={calendarsByUser}
      />
    </>
  );
}
