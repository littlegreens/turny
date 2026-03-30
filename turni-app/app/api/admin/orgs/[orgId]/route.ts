import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isSuperAdminEmail } from "@/lib/super-admin";

type Params = { params: Promise<{ orgId: string }> };

const PLAN_VALUES = ["FREE", "STARTER", "PRO", "ENTERPRISE"] as const;
type PlanValue = (typeof PLAN_VALUES)[number];

export async function PATCH(req: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email ?? null;
  if (!session?.user?.id) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  if (!isSuperAdminEmail(email)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { orgId } = await params;
  let body: { plan?: unknown } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Body non valido" }, { status: 400 });
  }

  const plan = String(body.plan ?? "").toUpperCase() as PlanValue;
  if (!PLAN_VALUES.includes(plan)) {
    return NextResponse.json({ error: "Plan non valido" }, { status: 400 });
  }

  const updated = await prisma.organization.update({
    where: { id: orgId },
    data: { plan },
    select: { id: true, plan: true },
  });

  return NextResponse.json({ ok: true, org: updated });
}

