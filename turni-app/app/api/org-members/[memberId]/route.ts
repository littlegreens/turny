import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import bcrypt from "bcrypt";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { resolveCanonicalProfessionalRole } from "@/lib/org-professional-roles";
import { getPrimaryRole, hasAnyRole, normalizeRoles } from "@/lib/org-roles";
import { prisma } from "@/lib/prisma";

const updateRoleSchema = z.object({
  firstName: z.string().trim().min(1, "Nome obbligatorio"),
  lastName: z.string().trim().max(80),
  username: z.string().trim().min(3, "Username obbligatorio"),
  professionalRole: z.string().trim().max(80).optional().or(z.literal("")),
  email: z.string().email("Email non valida"),
  password: z.string().min(8, "Password minima 8 caratteri").optional().or(z.literal("")),
  roles: z.array(z.enum(["OWNER", "ADMIN", "MANAGER", "WORKER"])).min(1, "Seleziona almeno un ruolo"),
  calendarPreferences: z
    .array(
      z.object({
        calendarMemberId: z.string().min(1),
        avoidShiftTypeIds: z.array(z.string().min(1)).default([]),
        targetShiftsMonth: z.number().int().min(0).max(200).nullable().optional(),
        targetHoursMonth: z.number().int().min(0).max(400).nullable().optional(),
        targetNightsMonth: z.number().int().min(0).max(31).nullable().optional(),
        targetSaturdaysMonth: z.number().int().min(0).max(8).nullable().optional(),
        targetSundaysMonth: z.number().int().min(0).max(8).nullable().optional(),
        avoidWeekdays: z.array(z.number().int().min(0).max(6)).default([]),
      }),
    )
    .default([]),
  defaultDisplayColor: z.union([z.string().regex(/^#[0-9A-Fa-f]{6}$/), z.literal(""), z.null()]).optional(),
  useDisplayColorInCalendars: z.boolean().optional(),
});

type Params = {
  params: Promise<{ memberId: string }>;
};

export async function PATCH(request: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const { memberId } = await params;
  const target = await prisma.orgMember.findUnique({ where: { id: memberId } });
  if (!target) return NextResponse.json({ error: "Membro non trovato" }, { status: 404 });

  const actor = await prisma.orgMember.findFirst({
    where: { userId: session.user.id, orgId: target.orgId },
  });
  const actorRoles = actor ? normalizeRoles([actor.role, ...actor.roles]) : [];
  if (!actor || !hasAnyRole(actorRoles, ["OWNER", "ADMIN", "MANAGER"])) {
    return NextResponse.json({ error: "Permessi insufficienti" }, { status: 403 });
  }

  const parsed = updateRoleSchema.safeParse(await request.json());
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Input non valido";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const requestedRoles = normalizeRoles(parsed.data.roles);
  const actorIsAdminLike = hasAnyRole(actorRoles, ["OWNER", "ADMIN"]);
  const targetCurrentRoles = normalizeRoles([target.role, ...target.roles]);
  const targetIsAdminLike = hasAnyRole(targetCurrentRoles, ["OWNER", "ADMIN"]);
  if (!actorIsAdminLike && targetIsAdminLike) {
    return NextResponse.json({ error: "Un manager non puo modificare OWNER/ADMIN" }, { status: 403 });
  }
  const roles = actorIsAdminLike
    ? requestedRoles.filter((role) => role !== "OWNER")
    : requestedRoles.filter((role) => role === "MANAGER" || role === "WORKER");
  if (!roles.length) {
    return NextResponse.json({ error: "Un manager puo assegnare solo MANAGER o WORKER" }, { status: 400 });
  }
  const role = getPrimaryRole(roles);
  const normalizedEmail = parsed.data.email.toLowerCase().trim();
  const professionalRoleResolved = await resolveCanonicalProfessionalRole(target.orgId, parsed.data.professionalRole || "");

  const updated = await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: target.userId },
      data: {
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        name: parsed.data.username,
        professionalRole: professionalRoleResolved,
        email: normalizedEmail,
        ...(parsed.data.password ? { passwordHash: await bcrypt.hash(parsed.data.password, 12) } : {}),
      },
    });

    const colorPatch =
      parsed.data.defaultDisplayColor === undefined
        ? {}
        : {
            defaultDisplayColor:
              parsed.data.defaultDisplayColor && parsed.data.defaultDisplayColor !== ""
                ? parsed.data.defaultDisplayColor
                : null,
          };
    const useColorPatch =
      parsed.data.useDisplayColorInCalendars === undefined
        ? {}
        : { useDisplayColorInCalendars: parsed.data.useDisplayColorInCalendars };

    const updatedMember = await tx.orgMember.update({
      where: { id: memberId },
      data: { role, roles, ...colorPatch, ...useColorPatch },
      include: {
        user: { select: { id: true, email: true, name: true, firstName: true, lastName: true, professionalRole: true } },
      },
    });

    const calendarMemberIds = parsed.data.calendarPreferences.map((p) => p.calendarMemberId);
    if (calendarMemberIds.length > 0) {
      const validCalendarMembers = await tx.calendarMember.findMany({
        where: {
          id: { in: calendarMemberIds },
          userId: target.userId,
          calendar: { orgId: target.orgId },
        },
        select: { id: true },
      });
      const validIds = new Set(validCalendarMembers.map((cm) => cm.id));

      for (const pref of parsed.data.calendarPreferences) {
        if (!validIds.has(pref.calendarMemberId)) continue;

        await tx.constraint.deleteMany({
          where: {
            memberId: pref.calendarMemberId,
            OR: [
              { type: "UNAVAILABLE_SHIFT", weight: "SOFT" },
              { type: "UNAVAILABLE_WEEKDAY", weight: "SOFT" },
              { type: "CUSTOM", note: "TARGET_SHIFTS_WEEK" },
              { type: "CUSTOM", note: "TARGET_SHIFTS_MONTH" },
              { type: "CUSTOM", weight: "SOFT", note: "TARGET_HOURS_MONTH" },
              { type: "CUSTOM", weight: "SOFT", note: "TARGET_NIGHTS_MONTH" },
              { type: "CUSTOM", weight: "SOFT", note: "TARGET_SATURDAYS_MONTH" },
              { type: "CUSTOM", weight: "SOFT", note: "TARGET_SUNDAYS_MONTH" },
            ],
          },
        });

        for (const shiftTypeId of [...new Set(pref.avoidShiftTypeIds)]) {
          await tx.constraint.create({
            data: {
              memberId: pref.calendarMemberId,
              type: "UNAVAILABLE_SHIFT",
              weight: "SOFT",
              value: { shiftTypeId },
              note: "BASE_AVOID_SHIFT",
              createdBy: session.user.id,
            },
          });
        }

        for (const weekday of [...new Set(pref.avoidWeekdays)]) {
          await tx.constraint.create({
            data: {
              memberId: pref.calendarMemberId,
              type: "UNAVAILABLE_WEEKDAY",
              weight: "SOFT",
              value: { weekday },
              note: "BASE_AVOID_WEEKDAY",
              createdBy: session.user.id,
            },
          });
        }

        if (typeof pref.targetShiftsMonth === "number") {
          await tx.constraint.create({
            data: {
              memberId: pref.calendarMemberId,
              type: "CUSTOM",
              weight: "HARD",
              value: { kind: "TARGET_SHIFTS_MONTH", shifts: pref.targetShiftsMonth },
              note: "TARGET_SHIFTS_MONTH",
              createdBy: session.user.id,
            },
          });
        }

        if (typeof pref.targetHoursMonth === "number") {
          await tx.constraint.create({
            data: {
              memberId: pref.calendarMemberId,
              type: "CUSTOM",
              weight: "SOFT",
              value: { kind: "TARGET_HOURS_MONTH", hours: pref.targetHoursMonth },
              note: "TARGET_HOURS_MONTH",
              createdBy: session.user.id,
            },
          });
        }

        if (typeof pref.targetNightsMonth === "number") {
          await tx.constraint.create({
            data: {
              memberId: pref.calendarMemberId,
              type: "CUSTOM",
              weight: "SOFT",
              value: { kind: "TARGET_NIGHTS_MONTH", nights: pref.targetNightsMonth },
              note: "TARGET_NIGHTS_MONTH",
              createdBy: session.user.id,
            },
          });
        }
        if (typeof pref.targetSaturdaysMonth === "number") {
          await tx.constraint.create({
            data: {
              memberId: pref.calendarMemberId,
              type: "CUSTOM",
              weight: "SOFT",
              value: { kind: "TARGET_SATURDAYS_MONTH", saturdays: pref.targetSaturdaysMonth },
              note: "TARGET_SATURDAYS_MONTH",
              createdBy: session.user.id,
            },
          });
        }
        if (typeof pref.targetSundaysMonth === "number") {
          await tx.constraint.create({
            data: {
              memberId: pref.calendarMemberId,
              type: "CUSTOM",
              weight: "SOFT",
              value: { kind: "TARGET_SUNDAYS_MONTH", sundays: pref.targetSundaysMonth },
              note: "TARGET_SUNDAYS_MONTH",
              createdBy: session.user.id,
            },
          });
        }

        await tx.calendarMember.update({
          where: { id: pref.calendarMemberId },
          data: {
            contractShiftsMonth: typeof pref.targetShiftsMonth === "number" ? pref.targetShiftsMonth : null,
            contractHoursMonth: typeof pref.targetHoursMonth === "number" ? pref.targetHoursMonth : null,
          },
        });
      }
    }

    return updatedMember;
  });

  return NextResponse.json({ member: updated });
}

export async function DELETE(_: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const { memberId } = await params;
  const target = await prisma.orgMember.findUnique({ where: { id: memberId } });
  if (!target) return NextResponse.json({ error: "Membro non trovato" }, { status: 404 });

  const actor = await prisma.orgMember.findFirst({
    where: { userId: session.user.id, orgId: target.orgId },
  });
  const actorRoles = actor ? normalizeRoles([actor.role, ...actor.roles]) : [];
  if (!actor || !hasAnyRole(actorRoles, ["OWNER", "ADMIN", "MANAGER"])) {
    return NextResponse.json({ error: "Permessi insufficienti" }, { status: 403 });
  }

  if (target.userId === session.user.id) {
    return NextResponse.json({ error: "Non puoi rimuovere te stesso" }, { status: 400 });
  }
  const actorIsAdminLike = hasAnyRole(actorRoles, ["OWNER", "ADMIN"]);
  const targetRoles = normalizeRoles([target.role, ...target.roles]);
  if (!actorIsAdminLike && hasAnyRole(targetRoles, ["OWNER", "ADMIN"])) {
    return NextResponse.json({ error: "Un manager non puo rimuovere OWNER/ADMIN" }, { status: 403 });
  }

  await prisma.orgMember.delete({ where: { id: memberId } });
  return NextResponse.json({ ok: true });
}
