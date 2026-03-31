import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { AppBreadcrumbs } from "@/components/app-breadcrumbs";
import { OrgSettingsForm } from "@/components/org-settings-form";
import { authOptions } from "@/lib/auth";
import { hasAnyRole, normalizeRoles } from "@/lib/org-roles";
import { prisma } from "@/lib/prisma";
import { isSuperAdminEmail } from "@/lib/super-admin";

type Props = {
  params: Promise<{ orgSlug: string }>;
};

export default async function OrgSettingsPage({ params }: Props) {
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
    include: { org: true },
  });

  const superAdmin = isSuperAdminEmail(session.user.email ?? null);
  if (!membership && !superAdmin) {
    notFound();
  }
  const org = membership?.org ?? (await prisma.organization.findUnique({ where: { slug: orgSlug } }));
  if (!org) notFound();
  const effectiveRoles = membership ? normalizeRoles([membership.role, ...membership.roles]) : ["OWNER", "ADMIN"];
  if (!hasAnyRole(effectiveRoles, ["OWNER", "ADMIN"])) {
    redirect(`/${org.slug}`);
  }

  return (
    <>
      <AppBreadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Impostazioni" },
        ]}
      />
      <h2 className="h2 mt-3">Impostazioni</h2>
      <p className="text-secondary">
        Aggiorna i dati principali dell&apos;organizzazione <strong>{org.name}</strong>.
      </p>
      <OrgSettingsForm orgSlug={org.slug} initialName={org.name} initialDescription={org.description ?? ""} />
    </>
  );
}
