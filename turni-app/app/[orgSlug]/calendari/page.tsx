import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { AppBreadcrumbs } from "@/components/app-breadcrumbs";
import { OrgCalendarsBoard } from "@/components/org-calendars-board";
import { authOptions } from "@/lib/auth";
import { hasAnyRole, normalizeRoles } from "@/lib/org-roles";
import { prisma } from "@/lib/prisma";
import { isSuperAdminEmail } from "@/lib/super-admin";

type Props = {
  params: Promise<{ orgSlug: string }>;
};

export default async function OrgCalendarsPage({ params }: Props) {
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

  const effectiveRoles = membership ? normalizeRoles([membership.role, ...membership.roles]) : (["OWNER", "ADMIN"] as const);
  const isWorkerOnly = !hasAnyRole(effectiveRoles, ["OWNER", "ADMIN", "MANAGER"]);
  if (isWorkerOnly) redirect(`/${org.slug}/turni`);

  const isManagerOnly = hasAnyRole(effectiveRoles, ["MANAGER"]) && !hasAnyRole(effectiveRoles, ["OWNER", "ADMIN"]);
  const assignedCalendarIds = isManagerOnly
    ? (
        await prisma.calendarMember.findMany({
          where: { userId: session.user.id, calendar: { orgId: org.id } },
          select: { calendarId: true },
        })
      ).map((item) => item.calendarId)
    : [];

  const calendars = await prisma.calendar.findMany({
    where: isManagerOnly
      ? { orgId: org.id, id: { in: assignedCalendarIds.length ? assignedCalendarIds : ["__none__"] } }
      : { orgId: org.id },
    orderBy: { createdAt: "desc" },
  });
  const canCreateCalendar = hasAnyRole(effectiveRoles, ["OWNER", "ADMIN"]);

  return (
    <>
      <AppBreadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Calendari" },
        ]}
      />
      <h2 className="h2 fw-bold mt-3">Calendari</h2>
      <p className="text-secondary mb-3">Gestisci i calendari operativi dell&apos;organizzazione.</p>
      <OrgCalendarsBoard orgSlug={org.slug} calendars={calendars} canCreateCalendar={canCreateCalendar} />
      <div className="mt-4 d-flex gap-3">
        <Link href={`/${org.slug}/settings`} className="link-dark">
          Impostazioni organizzazione
        </Link>
      </div>
    </>
  );
}

