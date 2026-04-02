import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { authorizeScheduleAccess, canEditScheduleAssignments } from "@/lib/schedule-access";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ scheduleId: string }> };

const coPresenceRuleSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(2).max(80),
  kind: z.enum(["ALWAYS_WITH", "NEVER_WITH"]),
  ifSelectors: z.array(z.string().min(1)).optional(),
  thenSelectors: z.array(z.string().min(1)).optional(),
  ifMemberIds: z.array(z.string().min(1)).optional(),
  thenMemberIds: z.array(z.string().min(1)).optional(),
  dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
});

const scheduleRulesSchema = z.object({
  coPresenceRules: z.array(coPresenceRuleSchema).default([]),
});

export async function GET(_: Request, { params }: Params) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

    const { scheduleId } = await params;
    const access = await authorizeScheduleAccess(scheduleId, session.user.id);
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

    const rules = (access.schedule.rules ?? {}) as unknown;
    const parsed = scheduleRulesSchema.safeParse(rules);
    const out = parsed.success ? parsed.data : { coPresenceRules: [] as Array<Record<string, unknown>> };
    const normalized = {
      coPresenceRules: out.coPresenceRules.map((r) => ({
        ...r,
        ifSelectors:
          r.ifSelectors ??
          (Array.isArray(r.ifMemberIds) ? r.ifMemberIds.map((id) => `MEMBER:${id}`) : []),
        thenSelectors:
          r.thenSelectors ??
          (Array.isArray(r.thenMemberIds) ? r.thenMemberIds.map((id) => `MEMBER:${id}`) : []),
      })),
    };
    return NextResponse.json({ rules: normalized });
  } catch (e) {
    console.error("[GET /rules]", e);
    return NextResponse.json({ error: "Errore interno server" }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: Params) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

    const { scheduleId } = await params;
    const access = await authorizeScheduleAccess(scheduleId, session.user.id);
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
    if (!canEditScheduleAssignments(access.roles, access.schedule.status)) {
      return NextResponse.json({ error: "Modifica regole consentita solo in bozza" }, { status: 403 });
    }

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return NextResponse.json({ error: "Body non valido" }, { status: 400 });
    }

    const parsed = scheduleRulesSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Regole non valide", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const cleaned = {
      coPresenceRules: parsed.data.coPresenceRules.map((r) => ({
        id: r.id,
        name: r.name,
        kind: r.kind,
        dates: r.dates,
        ifSelectors:
          r.ifSelectors ??
          (Array.isArray(r.ifMemberIds) ? r.ifMemberIds.map((id) => `MEMBER:${id}`) : []),
        thenSelectors:
          r.thenSelectors ??
          (Array.isArray(r.thenMemberIds) ? r.thenMemberIds.map((id) => `MEMBER:${id}`) : []),
      })),
    };

    const prevRules = (access.schedule.rules ?? {}) as Record<string, unknown>;
    const updated = await prisma.schedule.update({
      where: { id: scheduleId },
      data: { rules: { ...prevRules, ...cleaned } },
      select: { id: true, rules: true },
    });
    return NextResponse.json({ schedule: updated });
  } catch (e) {
    console.error("[PUT /rules]", e);
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Errore interno: ${msg}` }, { status: 500 });
  }
}
