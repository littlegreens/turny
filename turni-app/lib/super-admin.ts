export function parseSuperAdminEmails(raw: string | undefined | null): Set<string> {
  const out = new Set<string>();
  const parts = String(raw ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  for (const p of parts) out.add(p);
  return out;
}

export function isSuperAdminEmail(email: string | undefined | null): boolean {
  if (!email) return false;
  const set = parseSuperAdminEmails(process.env.SUPER_ADMIN_EMAILS);
  return set.has(email.trim().toLowerCase());
}

