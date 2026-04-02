import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { hasAnyRole, normalizeRoles } from "@/lib/org-roles";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  shiftTypeIds: z.array(z.string().min(1)).min(1),
});

type Params = {
  params: Promise<{ calId: string }>;
};

export async function PATCH(request: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  const { calId } = await params;
  const calendar = await prisma.calendar.findUnique({ where: { id: calId } });
  if (!calendar) return NextResponse.json({ error: "Calendario non trovato" }, { status: 404 });

  const membership = await prisma.orgMember.findFirst({
    where: { userId: session.user.id, orgId: calendar.orgId },
  });
  const roles = membership ? normalizeRoles([membership.role, ...membership.roles]) : [];
  if (!membership || !hasAnyRole(roles, ["OWNER", "ADMIN", "MANAGER"])) {
    return NextResponse.json({ error: "Permessi insufficienti" }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Input non valido" }, { status: 400 });

  const existing = await prisma.shiftType.findMany({
    where: { calendarId: calId, id: { in: parsed.data.shiftTypeIds } },
    select: { id: true },
  });
  if (existing.length !== parsed.data.shiftTypeIds.length) {
    return NextResponse.json({ error: "Fasce orarie non valide" }, { status: 400 });
  }

  await prisma.$transaction(
    parsed.data.shiftTypeIds.map((id, idx) =>
      prisma.shiftType.update({
        where: { id },
        data: { order: idx },
      }),
    ),
  );

  return NextResponse.json({ ok: true });
}

