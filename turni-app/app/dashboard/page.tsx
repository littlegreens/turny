import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isSuperAdminEmail } from "@/lib/super-admin";

export default async function DashboardRedirectPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  if (isSuperAdminEmail(session.user.email ?? null)) redirect("/admin");
  const membership = await prisma.orgMember.findFirst({
    where: { userId: session.user.id },
    include: { org: true },
    orderBy: { createdAt: "asc" },
  });
  if (membership) redirect(`/${membership.org.slug}`);
  redirect("/");
}
