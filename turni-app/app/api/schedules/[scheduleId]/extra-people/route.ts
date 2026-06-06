import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { authorizeScheduleAccess, canEditScheduleAssignments } from "@/lib/schedule-access";
import { prisma } from "@/lib/prisma";
import { parseProfessionalRoles, serializeProfessionalRoles } from "@/lib/professional-roles";
import { parseScheduleExtraPeople, type ScheduleExtraPerson } from "@/lib/schedule-extra-people";

type Params = { params: Promise<{ scheduleId: string }> };

const hexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

const professionalRoleField = z
  .string()
  .trim()
  .max(500)
  .refine((s) => parseProfessionalRoles(s).length > 0, { message: "Indica almeno un ruolo." });

const createSchema = z.object({
  label: z.string().trim().min(1).max(120),
  color: hexColor.optional(),
  professionalRole: professionalRoleField,
});

const patchSchema = z.object({
  id: z.string().min(1),
  label: z.string().trim().min(1).max(120).optional(),
  color: hexColor.optional(),
  professionalRole: professionalRoleField.optional(),
});

function normalizeProfessionalRole(raw: string): string {
  return serializeProfessionalRoles(parseProfessionalRoles(raw));
}

function readExtraPeople(rules: unknown): ScheduleExtraPerson[] {
  return parseScheduleExtraPeople(rules);
}

async function saveExtraPeople(scheduleId: string, prevRules: unknown, extraPeople: ScheduleExtraPerson[]) {
  const prev = (prevRules ?? {}) as Record<string, unknown>;
  return prisma.schedule.update({
    where: { id: scheduleId },
    data: { rules: { ...prev, extraPeople } },
    select: { id: true, rules: true },
  });
}

export async function GET(_: Request, { params }: Params) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

    const { scheduleId } = await params;
    const access = await authorizeScheduleAccess(scheduleId, session.user.id);
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

    return NextResponse.json({ extraPeople: readExtraPeople(access.schedule.rules) });
  } catch (e) {
    console.error("[GET /extra-people]", e);
    return NextResponse.json({ error: "Errore interno server" }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: Params) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

    const { scheduleId } = await params;
    const access = await authorizeScheduleAccess(scheduleId, session.user.id);
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
    if (!canEditScheduleAssignments(access.roles, access.schedule.status)) {
      return NextResponse.json({ error: "Modifica consentita solo in bozza" }, { status: 403 });
    }

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return NextResponse.json({ error: "Body non valido" }, { status: 400 });
    }

    const parsed = createSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Input non valido" },
        { status: 400 },
      );
    }

    const existing = readExtraPeople(access.schedule.rules);
    const normalized = parsed.data.label.replace(/\s+/g, " ").toLowerCase();
    if (existing.some((p) => p.label.replace(/\s+/g, " ").toLowerCase() === normalized)) {
      return NextResponse.json({ error: "Esiste già un extra con questo nome." }, { status: 409 });
    }

    const created: ScheduleExtraPerson = {
      id: randomUUID(),
      label: parsed.data.label.replace(/\s+/g, " ").trim(),
      color: parsed.data.color ?? "#6b7280",
      professionalRole: normalizeProfessionalRole(parsed.data.professionalRole),
    };

    const updated = await saveExtraPeople(scheduleId, access.schedule.rules, [...existing, created]);
    return NextResponse.json(
      { extraPerson: created, extraPeople: readExtraPeople(updated.rules) },
      { status: 201 },
    );
  } catch (e) {
    console.error("[POST /extra-people]", e);
    return NextResponse.json({ error: "Errore interno server" }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

    const { scheduleId } = await params;
    const access = await authorizeScheduleAccess(scheduleId, session.user.id);
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
    if (!canEditScheduleAssignments(access.roles, access.schedule.status)) {
      return NextResponse.json({ error: "Modifica consentita solo in bozza" }, { status: 403 });
    }

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return NextResponse.json({ error: "Body non valido" }, { status: 400 });
    }

    const parsed = patchSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Input non valido" },
        { status: 400 },
      );
    }

    const existing = readExtraPeople(access.schedule.rules);
    const idx = existing.findIndex((p) => p.id === parsed.data.id);
    if (idx < 0) return NextResponse.json({ error: "Extra non trovato" }, { status: 404 });

    const next = { ...existing[idx]! };
    if (parsed.data.label !== undefined) next.label = parsed.data.label.replace(/\s+/g, " ").trim();
    if (parsed.data.color !== undefined) next.color = parsed.data.color;
    if (parsed.data.professionalRole !== undefined) {
      next.professionalRole = normalizeProfessionalRole(parsed.data.professionalRole);
    }

    const dup = existing.some(
      (p, i) =>
        i !== idx && p.label.replace(/\s+/g, " ").toLowerCase() === next.label.replace(/\s+/g, " ").toLowerCase(),
    );
    if (dup) return NextResponse.json({ error: "Esiste già un extra con questo nome." }, { status: 409 });

    const nextList = [...existing];
    nextList[idx] = next;
    const updated = await saveExtraPeople(scheduleId, access.schedule.rules, nextList);
    return NextResponse.json({ extraPerson: next, extraPeople: readExtraPeople(updated.rules) });
  } catch (e) {
    console.error("[PATCH /extra-people]", e);
    return NextResponse.json({ error: "Errore interno server" }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: Params) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

    const { scheduleId } = await params;
    const access = await authorizeScheduleAccess(scheduleId, session.user.id);
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
    if (!canEditScheduleAssignments(access.roles, access.schedule.status)) {
      return NextResponse.json({ error: "Modifica consentita solo in bozza" }, { status: 403 });
    }

    const id = new URL(req.url).searchParams.get("id")?.trim();
    if (!id) return NextResponse.json({ error: "Parametro id mancante" }, { status: 400 });

    const existing = readExtraPeople(access.schedule.rules);
    if (!existing.some((p) => p.id === id)) {
      return NextResponse.json({ error: "Extra non trovato" }, { status: 404 });
    }

    const updated = await saveExtraPeople(
      scheduleId,
      access.schedule.rules,
      existing.filter((p) => p.id !== id),
    );
    return NextResponse.json({ ok: true, extraPeople: readExtraPeople(updated.rules) });
  } catch (e) {
    console.error("[DELETE /extra-people]", e);
    return NextResponse.json({ error: "Errore interno server" }, { status: 500 });
  }
}
