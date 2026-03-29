import { prisma } from "@/lib/prisma";

/**
 * Allinea il ruolo professionale a una forma già usata in organizzazione (stesso testo, confronto case-insensitive).
 * Se è un ruolo nuovo, restituisce `proposed` trimmato.
 */
export async function resolveCanonicalProfessionalRole(orgId: string, proposed: string): Promise<string> {
  const t = proposed.trim();
  if (!t) return "";
  const users = await prisma.user.findMany({
    where: {
      orgMemberships: { some: { orgId } },
      professionalRole: { not: "" },
    },
    select: { professionalRole: true },
  });
  const lower = t.toLowerCase();
  for (const u of users) {
    const pr = (u.professionalRole ?? "").trim();
    if (pr && pr.toLowerCase() === lower) return pr;
  }
  return t;
}

/** Dedup per chiave minuscola, mantiene la prima grafia incontrata. */
export function distinctProfessionalRolesFromMembers(members: { user: { professionalRole: string } }[]): string[] {
  const map = new Map<string, string>();
  for (const m of members) {
    const r = (m.user.professionalRole ?? "").trim();
    if (!r) continue;
    const k = r.toLowerCase();
    if (!map.has(k)) map.set(k, r);
  }
  return [...map.values()].sort((a, b) => a.localeCompare(b, "it", { sensitivity: "base" }));
}
