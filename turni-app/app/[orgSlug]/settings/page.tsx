import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { AppBreadcrumbs } from "@/components/app-breadcrumbs";
import { authOptions } from "@/lib/auth";
import { hasAnyRole, normalizeRoles } from "@/lib/org-roles";
import { prisma } from "@/lib/prisma";

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

  if (!membership) {
    notFound();
  }
  const effectiveRoles = normalizeRoles([membership.role, ...membership.roles]);
  if (!hasAnyRole(effectiveRoles, ["OWNER", "ADMIN"])) {
    redirect(`/${membership.org.slug}`);
  }

  return (
    <>
      <AppBreadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Impostazioni" },
        ]}
      />
      <h2 className="h2 fw-bold mt-3">Impostazioni</h2>
      <p className="text-secondary">
        Configura i parametri principali dell&apos;organizzazione <strong>{membership.org.name}</strong>.
      </p>
      <footer className="small text-secondary mt-4 pt-2 border-top">
        Turny - gestione turni
      </footer>
    </>
  );
}
