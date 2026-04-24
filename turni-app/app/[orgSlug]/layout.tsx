import { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { AppHeader } from "@/components/app-header";
import { OrgSidebar } from "@/components/org-sidebar";
import { authOptions } from "@/lib/auth";
import { FALLBACK_ORG_ADMIN_ROLES, hasAnyRole, normalizeRoles } from "@/lib/org-roles";
import { prisma } from "@/lib/prisma";
import { isSuperAdminEmail } from "@/lib/super-admin";

type Props = {
  children: ReactNode;
  params: Promise<{ orgSlug: string }>;
};

export default async function OrgLayout({ children, params }: Props) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login");
  }

  const { orgSlug } = await params;
  const membership = await prisma.orgMember.findFirst({
    where: { userId: session.user.id, org: { slug: orgSlug } },
    include: { org: true },
  });

  const isSuperAdmin = isSuperAdminEmail(session.user.email ?? null);
  if (!membership && !isSuperAdmin) {
    notFound();
  }
  const org = membership?.org ?? (await prisma.organization.findUnique({ where: { slug: orgSlug } }));
  if (!org) notFound();
  const roles = membership ? normalizeRoles([membership.role, ...membership.roles]) : FALLBACK_ORG_ADMIN_ROLES;
  const isWorkerOnly = !hasAnyRole(roles, ["OWNER", "ADMIN", "MANAGER"]);
  const displayName = session.user.name || session.user.email?.split("@")[0] || null;

  return (
    <div className="d-flex">
      <OrgSidebar
        orgSlug={org.slug}
        orgName={org.name}
        isWorkerOnly={isWorkerOnly}
        isSuperAdmin={isSuperAdmin}
      />
      <main className="container-fluid py-4 px-3 px-xl-4" style={{ minHeight: "100vh" }}>
        <AppHeader isAuthenticated displayName={displayName} />
        <div className="pt-3">{children}</div>
      </main>
    </div>
  );
}
