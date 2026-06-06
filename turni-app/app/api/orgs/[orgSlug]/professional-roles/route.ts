import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { hasAnyRole, normalizeRoles } from "@/lib/org-roles";
import {
  addOrgProfessionalRoleCatalog,
  removeOrgProfessionalRoleCatalog,
  renameOrgProfessionalRoleCatalog,
} from "@/lib/org-professional-roles";
import { parseProfessionalRoles, serializeProfessionalRoles } from "@/lib/professional-roles";
import { prisma } from "@/lib/prisma";

const deleteSchema = z.object({
  role: z.string().trim().min(1),
});
const renameSchema = z.object({
  oldRole: z.string().trim().min(1),
  newRole: z.string().trim().min(1),
});
const createSchema = z.object({
  role: z.string().trim().min(1).max(80),
});

type Params = {
  params: Promise<{ orgSlug: string }>;
};

async function authorizeManager(orgSlug: string, userId: string) {
  const membership = await prisma.orgMember.findFirst({
    where: { userId, org: { slug: orgSlug } },
    include: { org: true },
  });
  if (!membership) return null;
  const roles = normalizeRoles([membership.role, ...membership.roles]);
  if (!hasAnyRole(roles, ["OWNER", "ADMIN", "MANAGER"])) return null;
  return membership;
}

export async function POST(request: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  const { orgSlug } = await params;
  const membership = await authorizeManager(orgSlug, session.user.id);
  if (!membership) return NextResponse.json({ error: "Permessi insufficienti" }, { status: 403 });

  const parsed = createSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Input non valido" }, { status: 400 });

  const created = await addOrgProfessionalRoleCatalog(membership.orgId, parsed.data.role);
  if (!created) return NextResponse.json({ error: "Ruolo non valido" }, { status: 400 });

  return NextResponse.json({ ok: true, role: created });
}

export async function DELETE(request: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  const { orgSlug } = await params;
  const membership = await authorizeManager(orgSlug, session.user.id);
  if (!membership) return NextResponse.json({ error: "Permessi insufficienti" }, { status: 403 });

  const parsed = deleteSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Input non valido" }, { status: 400 });

  const roleToRemove = parsed.data.role.trim().toLowerCase();
  const orgUsers = await prisma.orgMember.findMany({
    where: { orgId: membership.orgId },
    select: {
      userId: true,
      user: { select: { professionalRole: true } },
    },
  });

  const updates = orgUsers.flatMap((row) => {
    const current = parseProfessionalRoles(row.user.professionalRole ?? "");
    const next = current.filter((r) => r.toLowerCase() !== roleToRemove);
    if (next.length === current.length) return [];
    return [
      prisma.user.update({
        where: { id: row.userId },
        data: { professionalRole: serializeProfessionalRoles(next) },
      }),
    ];
  });

  await removeOrgProfessionalRoleCatalog(membership.orgId, parsed.data.role);

  if (updates.length) {
    await prisma.$transaction(updates);
  }

  return NextResponse.json({ ok: true, updatedUsers: updates.length });
}

export async function PATCH(request: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  const { orgSlug } = await params;
  const membership = await authorizeManager(orgSlug, session.user.id);
  if (!membership) return NextResponse.json({ error: "Permessi insufficienti" }, { status: 403 });

  const parsed = renameSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Input non valido" }, { status: 400 });
  const oldRole = parsed.data.oldRole.trim().toLowerCase();
  const newRole = parsed.data.newRole.trim();
  if (!newRole) return NextResponse.json({ error: "Nuovo ruolo non valido" }, { status: 400 });

  const orgUsers = await prisma.orgMember.findMany({
    where: { orgId: membership.orgId },
    select: {
      userId: true,
      user: { select: { professionalRole: true } },
    },
  });

  const updates = orgUsers.flatMap((row) => {
    const current = parseProfessionalRoles(row.user.professionalRole ?? "");
    let changed = false;
    const next = current.map((r) => {
      if (r.toLowerCase() === oldRole) {
        changed = true;
        return newRole;
      }
      return r;
    });
    if (!changed) return [];
    return [
      prisma.user.update({
        where: { id: row.userId },
        data: { professionalRole: serializeProfessionalRoles(next) },
      }),
    ];
  });

  await renameOrgProfessionalRoleCatalog(membership.orgId, parsed.data.oldRole, newRole);

  if (updates.length) {
    await prisma.$transaction(updates);
  }

  return NextResponse.json({ ok: true, updatedUsers: updates.length });
}
