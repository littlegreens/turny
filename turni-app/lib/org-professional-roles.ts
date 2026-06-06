import { prisma } from "@/lib/prisma";
import { parseProfessionalRoles, serializeProfessionalRoles } from "@/lib/professional-roles";

function mergeRoleStrings(...sources: (string | null | undefined)[]): string[] {
  const map = new Map<string, string>();
  for (const raw of sources) {
    for (const r of parseProfessionalRoles(raw ?? "")) {
      const k = r.toLowerCase();
      if (!map.has(k)) map.set(k, r);
    }
  }
  return [...map.values()].sort((a, b) => a.localeCompare(b, "it", { sensitivity: "base" }));
}

/**
 * Allinea il ruolo professionale a una forma già usata in organizzazione (stesso testo, confronto case-insensitive).
 * Se è un ruolo nuovo, restituisce `proposed` trimmato.
 */
export async function resolveCanonicalProfessionalRole(orgId: string, proposed: string): Promise<string> {
  const proposedRoles = parseProfessionalRoles(proposed);
  if (!proposedRoles.length) return "";

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { professionalRoleCatalog: true },
  });

  const users = await prisma.user.findMany({
    where: {
      orgMemberships: { some: { orgId } },
      professionalRole: { not: "" },
    },
    select: { professionalRole: true },
  });

  const knownByLower = new Map<string, string>();
  for (const r of parseProfessionalRoles(org?.professionalRoleCatalog ?? "")) {
    const key = r.toLowerCase();
    if (!knownByLower.has(key)) knownByLower.set(key, r);
  }
  for (const u of users) {
    for (const pr of parseProfessionalRoles(u.professionalRole ?? "")) {
      const key = pr.toLowerCase();
      if (!knownByLower.has(key)) knownByLower.set(key, pr);
    }
  }

  const normalized = proposedRoles.map((r) => knownByLower.get(r.toLowerCase()) ?? r.trim()).filter(Boolean);
  return serializeProfessionalRoles(normalized);
}

/** Dedup catalogo org + ruoli sulle persone. */
export function distinctProfessionalRoles(
  members: { user: { professionalRole: string } }[],
  orgCatalog?: string | null,
): string[] {
  return mergeRoleStrings(orgCatalog, ...members.map((m) => m.user.professionalRole));
}

/** @deprecated Usare `distinctProfessionalRoles(members, orgCatalog)`. */
export function distinctProfessionalRolesFromMembers(members: { user: { professionalRole: string } }[]): string[] {
  return distinctProfessionalRoles(members);
}

export async function addOrgProfessionalRoleCatalog(orgId: string, roleRaw: string): Promise<string | null> {
  const role = roleRaw.trim();
  if (!role) return null;

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { professionalRoleCatalog: true },
  });
  if (!org) return null;

  const current = parseProfessionalRoles(org.professionalRoleCatalog ?? "");
  if (current.some((r) => r.toLowerCase() === role.toLowerCase())) {
    return current.find((r) => r.toLowerCase() === role.toLowerCase()) ?? role;
  }

  const next = serializeProfessionalRoles([...current, role]);
  await prisma.organization.update({
    where: { id: orgId },
    data: { professionalRoleCatalog: next },
  });
  return role;
}

export async function renameOrgProfessionalRoleCatalog(orgId: string, oldRole: string, newRole: string): Promise<void> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { professionalRoleCatalog: true },
  });
  if (!org) return;

  const oldKey = oldRole.trim().toLowerCase();
  const catalog = parseProfessionalRoles(org.professionalRoleCatalog ?? "");
  let changed = false;
  const nextCatalog = catalog.map((r) => {
    if (r.toLowerCase() === oldKey) {
      changed = true;
      return newRole.trim();
    }
    return r;
  });

  if (changed) {
    await prisma.organization.update({
      where: { id: orgId },
      data: { professionalRoleCatalog: serializeProfessionalRoles(nextCatalog) },
    });
  }
}

export async function removeOrgProfessionalRoleCatalog(orgId: string, roleRaw: string): Promise<void> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { professionalRoleCatalog: true },
  });
  if (!org) return;

  const roleKey = roleRaw.trim().toLowerCase();
  const next = parseProfessionalRoles(org.professionalRoleCatalog ?? "").filter((r) => r.toLowerCase() !== roleKey);
  await prisma.organization.update({
    where: { id: orgId },
    data: { professionalRoleCatalog: serializeProfessionalRoles(next) },
  });
}
