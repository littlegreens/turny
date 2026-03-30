import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { hasAnyRole, normalizeRoles } from "@/lib/org-roles";
import { prisma } from "@/lib/prisma";
import { isSuperAdminEmail } from "@/lib/super-admin";

const bodySchema = z.object({
  name: z.string().trim().min(2, "Nome organizzazione obbligatorio"),
  description: z.string().trim().max(400).optional().nullable(),
});

type Params = {
  params: Promise<{ orgSlug: string }>;
};

export async function PATCH(req: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  const { orgSlug } = await params;
  const org = await prisma.organization.findUnique({ where: { slug: orgSlug }, select: { id: true } });
  if (!org) return NextResponse.json({ error: "Organizzazione non trovata" }, { status: 404 });

  const isSuper = isSuperAdminEmail(session.user.email ?? null);
  if (!isSuper) {
    const membership = await prisma.orgMember.findFirst({
      where: { userId: session.user.id, orgId: org.id },
      select: { role: true, roles: true },
    });
    const roles = membership ? normalizeRoles([membership.role, ...membership.roles]) : [];
    if (!membership || !hasAnyRole(roles, ["OWNER", "ADMIN"])) {
      return NextResponse.json({ error: "Permessi insufficienti" }, { status: 403 });
    }
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Input non valido" }, { status: 400 });
  }

  const updated = await prisma.organization.update({
    where: { slug: orgSlug },
    data: {
      name: parsed.data.name,
      description: parsed.data.description ? parsed.data.description : null,
    },
    select: { slug: true, name: true, description: true },
  });

  return NextResponse.json({ ok: true, org: updated });
}

