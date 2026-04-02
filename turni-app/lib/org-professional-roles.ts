import { prisma } from "@/lib/prisma";
import { parseProfessionalRoles, serializeProfessionalRoles } from "@/lib/professional-roles";

/**
 * Allinea il ruolo professionale a una forma già usata in organizzazione (stesso testo, confronto case-insensitive).
 * Se è un ruolo nuovo, restituisce `proposed` trimmato.
 */
export async function resolveCanonicalProfessionalRole(orgId: string, proposed: string): Promise<string> {
  const proposedRoles = parseProfessionalRoles(proposed);
  if (!proposedRoles.length) return "";
  const users = await prisma.user.findMany({
    where: {
      orgMemberships: { some: { orgId } },
      professionalRole: { not: "" },
    },
    select: { professionalRole: true },
  });
  const knownByLower = new Map<string, string>();
  for (const u of users) {
    for (const pr of parseProfessionalRoles(u.professionalRole ?? "")) {
      const key = pr.toLowerCase();
      if (!knownByLower.has(key)) knownByLower.set(key, pr);
    }
  }
  const normalized = proposedRoles.map((r) => knownByLower.get(r.toLowerCase()) ?? r.trim()).filter(Boolean);
  return serializeProfessionalRoles(normalized);
}

/** Dedup per chiave minuscola, mantiene la prima grafia incontrata. */
export function distinctProfessionalRolesFromMembers(members: { user: { professionalRole: string } }[]): string[] {
  const map = new Map<string, string>();
  for (const m of members) {
    for (const r of parseProfessionalRoles(m.user.professionalRole ?? "")) {
      const k = r.toLowerCase();
      if (!map.has(k)) map.set(k, r);
    }
  }
  return [...map.values()].sort((a, b) => a.localeCompare(b, "it", { sensitivity: "base" }));
}
