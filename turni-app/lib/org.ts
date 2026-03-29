import { prisma } from "@/lib/prisma";

export async function getPrimaryOrgSlugForUser(userId: string) {
  const membership = await prisma.orgMember.findFirst({
    where: { userId },
    include: { org: true },
    orderBy: { createdAt: "asc" },
  });

  return membership?.org.slug ?? null;
}
