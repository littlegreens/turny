import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { hasAnyRole, normalizeRoles } from "@/lib/org-roles";
import { prisma } from "@/lib/prisma";

const createCalendarSchema = z.object({
  name: z.string().trim().min(2, "Nome calendario troppo corto"),
  description: z.string().trim().max(300).optional().or(z.literal("")),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Colore non valido")
    .default("#3B8BD4"),
  timezone: z.string().trim().min(3).default("Europe/Rome"),
  activeWeekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7).default([1, 2, 3, 4, 5]),
});

type Params = {
  params: Promise<{ orgSlug: string }>;
};

export async function GET(_: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const { orgSlug } = await params;

  const membership = await prisma.orgMember.findFirst({
    where: {
      userId: session.user.id,
      org: { slug: orgSlug },
    },
    include: { org: true },
  });

  if (!membership) {
    return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
  }
  const effectiveRoles = normalizeRoles([membership.role, ...membership.roles]);
  const isManagerOnly = hasAnyRole(effectiveRoles, ["MANAGER"]) && !hasAnyRole(effectiveRoles, ["OWNER", "ADMIN"]);
  const assignedCalendarIds = isManagerOnly
    ? (
        await prisma.calendarMember.findMany({
          where: { userId: session.user.id, calendar: { orgId: membership.org.id } },
          select: { calendarId: true },
        })
      ).map((item) => item.calendarId)
    : [];

  const calendars = await prisma.calendar.findMany({
    where: isManagerOnly
      ? { orgId: membership.org.id, id: { in: assignedCalendarIds.length ? assignedCalendarIds : ["__none__"] } }
      : { orgId: membership.org.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      description: true,
      color: true,
      timezone: true,
      activeWeekdays: true,
      isActive: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ calendars });
}

export async function POST(request: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const { orgSlug } = await params;

  const membership = await prisma.orgMember.findFirst({
    where: {
      userId: session.user.id,
      org: { slug: orgSlug },
    },
    include: { org: true },
  });

  if (!membership) {
    return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
  }

  const effectiveRoles = normalizeRoles([membership.role, ...membership.roles]);
  if (!hasAnyRole(effectiveRoles, ["OWNER", "ADMIN"])) {
    return NextResponse.json(
      { error: "Non hai permessi per creare calendari" },
      { status: 403 },
    );
  }

  const body = await request.json();
  const parsed = createCalendarSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Input non valido" },
      { status: 400 },
    );
  }

  const { name, description, color, timezone, activeWeekdays } = parsed.data;

  const calendar = await prisma.calendar.create({
    data: {
      orgId: membership.org.id,
      name,
      description: description || null,
      color,
      timezone,
      activeWeekdays,
    },
  });

  return NextResponse.json({ calendar }, { status: 201 });
}
