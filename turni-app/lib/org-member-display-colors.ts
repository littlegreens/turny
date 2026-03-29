import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type OrgMemberDisplayColorRow = {
  userId: string;
  defaultDisplayColor: string | null;
  useDisplayColorInCalendars: boolean;
};

/** Legge i campi colore su OrgMember senza dipendere dal client Prisma rigenerato (utile se `prisma generate` fallisce). */
export async function fetchOrgMemberDisplayColors(
  orgId: string,
  userIds: string[],
): Promise<OrgMemberDisplayColorRow[]> {
  if (userIds.length === 0) return [];
  return prisma.$queryRaw<OrgMemberDisplayColorRow[]>`
    SELECT "userId", "defaultDisplayColor", "useDisplayColorInCalendars"
    FROM "OrgMember"
    WHERE "orgId" = ${orgId}
    AND "userId" IN (${Prisma.join(userIds)})
  `;
}
