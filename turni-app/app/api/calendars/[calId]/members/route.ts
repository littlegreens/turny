import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { canManageCalendarRoster } from "@/lib/calendar-membership-access";
import { prisma } from "@/lib/prisma";

const addMemberSchema = z.object({
  userId: z.string().min(1),
});

type Params = {
  params: Promise<{ calId: string }>;
};

function labelUser(u: { firstName: string; lastName: string; email: string }) {
  return `${`${u.firstName} ${u.lastName}`.trim() || u.email}`;
}

export async function GET(_: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  const { calId } = await params;
  const access = await canManageCalendarRoster(session.user.id, calId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const [inCalendar, orgMembers] = await Promise.all([
    prisma.calendarMember.findMany({
      where: { calendarId: calId },
      include: { user: { select: { firstName: true, lastName: true, email: true, professionalRole: true } } },
      orderBy: { joinedAt: "asc" },
    }),
    prisma.orgMember.findMany({
      where: { orgId: access.calendar.orgId },
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    }),
  ]);

  const inSet = new Set(inCalendar.map((m) => m.userId));
  const available = orgMembers
    .filter((m) => !inSet.has(m.userId))
    .map((m) => ({
      userId: m.userId,
      label: labelUser(m.user),
      email: m.user.email,
    }));

  return NextResponse.json({
    inCalendar: inCalendar.map((m) => ({
      calendarMemberId: m.id,
      userId: m.userId,
      label: labelUser(m.user),
      email: m.user.email,
      professionalRole: m.user.professionalRole || "",
    })),
    availableToAdd: available,
  });
}

export async function POST(request: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  const { calId } = await params;
  const access = await canManageCalendarRoster(session.user.id, calId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const parsed = addMemberSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Input non valido" }, { status: 400 });
  }

  const { userId } = parsed.data;

  const orgMember = await prisma.orgMember.findUnique({
    where: { userId_orgId: { userId, orgId: access.calendar.orgId } },
  });
  if (!orgMember) {
    return NextResponse.json({ error: "L'utente non appartiene all'organizzazione" }, { status: 400 });
  }

  const existing = await prisma.calendarMember.findUnique({
    where: { calendarId_userId: { calendarId: calId, userId } },
  });
  if (existing) {
    return NextResponse.json({ error: "Gia presente nel calendario" }, { status: 409 });
  }

  const created = await prisma.calendarMember.create({
    data: {
      calendarId: calId,
      userId,
      contractMode: access.calendar.defaultContractMode,
    },
    include: { user: { select: { firstName: true, lastName: true, email: true, professionalRole: true } } },
  });

  return NextResponse.json(
    {
      calendarMember: {
        calendarMemberId: created.id,
        userId: created.userId,
        label: labelUser(created.user),
        email: created.user.email,
        professionalRole: created.user.professionalRole || "",
      },
    },
    { status: 201 },
  );
}
