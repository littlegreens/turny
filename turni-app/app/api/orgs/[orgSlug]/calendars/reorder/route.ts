import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { hasAnyRole, normalizeRoles } from "@/lib/org-roles";
import { prisma } from "@/lib/prisma";

const reorderSchema = z.object({
  calendarIds: z.array(z.string().min(1)).min(1),
});

type Params = {
  params: Promise<{ orgSlug: string }>;
};

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
  if (!hasAnyRole(roles, ["OWNER", "ADMIN"])) {
    return NextResponse.json({ error: "Permessi insufficienti" }, { status: 403 });
  }

  const parsed = reorderSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Input non valido" }, { status: 400 });

  const calendars = await prisma.calendar.findMany({
    where: { orgId: membership.org.id, id: { in: parsed.data.calendarIds } },
    select: { id: true, aiConfig: true },
  });
  if (calendars.length !== parsed.data.calendarIds.length) {
    return NextResponse.json({ error: "Calendari non validi" }, { status: 400 });
  }

  const byId = new Map(calendars.map((c) => [c.id, c]));
  await prisma.$transaction(
    parsed.data.calendarIds.map((calendarId, idx) =>
      prisma.calendar.update({
        where: { id: calendarId },
        data: {
          aiConfig: {
            ...((byId.get(calendarId)?.aiConfig as Record<string, unknown> | null) ?? {}),
            orderIndex: idx,
          },
        },
      }),
    ),
  );

  return NextResponse.json({ ok: true });
}

