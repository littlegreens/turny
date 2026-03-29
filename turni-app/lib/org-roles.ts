export type OrgRoleValue = "OWNER" | "ADMIN" | "MANAGER" | "WORKER";

export const ROLE_PRIORITY: OrgRoleValue[] = ["OWNER", "ADMIN", "MANAGER", "WORKER"];

export function normalizeRoles(input: OrgRoleValue[]) {
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
