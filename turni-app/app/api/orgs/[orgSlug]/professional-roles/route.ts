import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { hasAnyRole, normalizeRoles } from "@/lib/org-roles";
import { parseProfessionalRoles, serializeProfessionalRoles } from "@/lib/professional-roles";
import { prisma } from "@/lib/prisma";

const deleteSchema = z.object({
  role: z.string().trim().min(1),
});
const renameSchema = z.object({
  oldRole: z.string().trim().min(1),
  newRole: z.string().trim().min(1),
});

type Params = {
  params: Promise<{ orgSlug: string }>;
};

export async function DELETE(request: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  const { orgSlug } = await params;
  const membership = await prisma.orgMember.findFirst({
    where: { userId: session.user.id, org: { slug: orgSlug } },
    include: { org: true },
  });
  if (!membership) return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
  const roles = normalizeRoles([membership.role, ...membership.roles]);
  if (!hasAnyRole(roles, ["OWNER", "ADMIN", "MANAGER"])) {
    return NextResponse.json({ error: "Permessi insufficienti" }, { status: 403 });
  }

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

  const updates = orgUsers
    .map((row) => {
      const current = parseProfessionalRoles(row.user.professionalRole ?? "");
      const next = current.filter((r) => r.toLowerCase() !== roleToRemove);
      if (next.length === current.length) return null;
      return prisma.user.update({
        where: { id: row.userId },
        data: { professionalRole: serializeProfessionalRoles(next) },
      });
    })
    .filter(Boolean);

  if (updates.length) {
    await prisma.$transaction(updates);
  }

  return NextResponse.json({ ok: true, updatedUsers: updates.length });
}

export async function PATCH(request: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  const { orgSlug } = await params;
  const membership = await prisma.orgMember.findFirst({
    where: { userId: session.user.id, org: { slug: orgSlug } },
    include: { org: true },
  });
  if (!membership) return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
  const roles = normalizeRoles([membership.role, ...membership.roles]);
  if (!hasAnyRole(roles, ["OWNER", "ADMIN", "MANAGER"])) {
    return NextResponse.json({ error: "Permessi insufficienti" }, { status: 403 });
  }

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

  const updates = orgUsers
    .map((row) => {
      const current = parseProfessionalRoles(row.user.professionalRole ?? "");
      let changed = false;
      const next = current.map((r) => {
        if (r.toLowerCase() === oldRole) {
          changed = true;
          return newRole;
        }
        return r;
      });
      if (!changed) return null;
      return prisma.user.update({
        where: { id: row.userId },
        data: { professionalRole: serializeProfessionalRoles(next) },
      });
    })
    .filter(Boolean);

  if (updates.length) {
    await prisma.$transaction(updates);
  }

  return NextResponse.json({ ok: true, updatedUsers: updates.length });
}

