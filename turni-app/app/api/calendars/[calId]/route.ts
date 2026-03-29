import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { hasAnyRole, normalizeRoles } from "@/lib/org-roles";
import { prisma } from "@/lib/prisma";

const jsonBlock = z.any();

const updateCalendarSchema = z.object({
  name: z.string().trim().min(2).optional(),
  description: z.string().trim().max(300).optional().or(z.literal("")),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  isActive: z.boolean().optional(),
  activeWeekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7).optional(),
  /** Regole scheduler (oggetto JSON) — brain §2c */
  rules: jsonBlock.optional().nullable(),
  /** Regole in linguaggio naturale (es. array di stringhe) */
  customRules: jsonBlock.optional().nullable(),
  aiConfig: jsonBlock.optional().nullable(),
});

type Params = {
  params: Promise<{ calId: string }>;
};

export async function PATCH(request: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const { calId } = await params;
  const calendar = await prisma.calendar.findUnique({ where: { id: calId } });
  if (!calendar) {
    return NextResponse.json({ error: "Calendario non trovato" }, { status: 404 });
  }

  const membership = await prisma.orgMember.findFirst({
    where: { userId: session.user.id, orgId: calendar.orgId },
  });
  const effectiveRoles = membership ? normalizeRoles([membership.role, ...membership.roles]) : [];
  if (!membership || !hasAnyRole(effectiveRoles, ["OWNER", "ADMIN", "MANAGER"])) {
    return NextResponse.json({ error: "Permessi insufficienti" }, { status: 403 });
  }
  const isManagerOnly = hasAnyRole(effectiveRoles, ["MANAGER"]) && !hasAnyRole(effectiveRoles, ["OWNER", "ADMIN"]);
  if (isManagerOnly) {
    const access = await prisma.calendarMember.findUnique({
      where: { calendarId_userId: { calendarId: calendar.id, userId: session.user.id } },
    });
    if (!access) return NextResponse.json({ error: "Permessi insufficienti" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = updateCalendarSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Input non valido" }, { status: 400 });
  }

  const updated = await prisma.calendar.update({
    where: { id: calId },
    data: {
      ...(parsed.data.name ? { name: parsed.data.name } : {}),
      ...(parsed.data.description !== undefined
        ? { description: parsed.data.description || null }
        : {}),
      ...(parsed.data.color ? { color: parsed.data.color } : {}),
      ...(parsed.data.isActive !== undefined ? { isActive: parsed.data.isActive } : {}),
      ...(parsed.data.activeWeekdays ? { activeWeekdays: parsed.data.activeWeekdays } : {}),
      ...(parsed.data.rules !== undefined ? { rules: parsed.data.rules } : {}),
      ...(parsed.data.customRules !== undefined ? { customRules: parsed.data.customRules } : {}),
      ...(parsed.data.aiConfig !== undefined ? { aiConfig: parsed.data.aiConfig } : {}),
    },
  });

  return NextResponse.json({ calendar: updated });
}

export async function DELETE(_: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const { calId } = await params;
  const calendar = await prisma.calendar.findUnique({ where: { id: calId } });
  if (!calendar) {
    return NextResponse.json({ error: "Calendario non trovato" }, { status: 404 });
  }

  const membership = await prisma.orgMember.findFirst({
    where: { userId: session.user.id, orgId: calendar.orgId },
  });
  const effectiveRoles = membership ? normalizeRoles([membership.role, ...membership.roles]) : [];
  if (!membership || !hasAnyRole(effectiveRoles, ["OWNER", "ADMIN", "MANAGER"])) {
    return NextResponse.json({ error: "Permessi insufficienti" }, { status: 403 });
  }
  const isManagerOnly = hasAnyRole(effectiveRoles, ["MANAGER"]) && !hasAnyRole(effectiveRoles, ["OWNER", "ADMIN"]);
  if (isManagerOnly) {
    const access = await prisma.calendarMember.findUnique({
      where: { calendarId_userId: { calendarId: calendar.id, userId: session.user.id } },
    });
    if (!access) return NextResponse.json({ error: "Permessi insufficienti" }, { status: 403 });
  }

  await prisma.calendar.delete({ where: { id: calId } });
  return NextResponse.json({ ok: true });
}
