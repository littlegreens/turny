export function parseProfessionalRoles(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[|,;\n]+/)) {
    const role = part.trim();
    if (!role) continue;
    const key = role.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(role);
  }
  return out;
}

export function serializeProfessionalRoles(roles: string[]): string {
  return roles.map((r) => r.trim()).filter(Boolean).join(" | ");
}

