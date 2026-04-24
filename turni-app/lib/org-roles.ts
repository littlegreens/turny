export type OrgRoleValue = "OWNER" | "ADMIN" | "MANAGER" | "WORKER";

/** Fallback quando l'utente è super-admin senza riga OrgMember (mantiene stesso comportamento di prima). */
export const FALLBACK_ORG_ADMIN_ROLES: OrgRoleValue[] = ["OWNER", "ADMIN"];

export const ROLE_PRIORITY: OrgRoleValue[] = ["OWNER", "ADMIN", "MANAGER", "WORKER"];

export function normalizeRoles(input: OrgRoleValue[]): OrgRoleValue[] {
  const unique = [...new Set(input)];
  return unique.sort((a, b) => ROLE_PRIORITY.indexOf(a) - ROLE_PRIORITY.indexOf(b));
}

export function getPrimaryRole(roles: OrgRoleValue[]) {
  const normalized = normalizeRoles(roles);
  return normalized[0] ?? "WORKER";
}

export function hasAnyRole(roles: OrgRoleValue[], accepted: OrgRoleValue[]) {
  return normalizeRoles(roles).some((role) => accepted.includes(role));
}
