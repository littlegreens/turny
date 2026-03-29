import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import bcrypt from "bcrypt";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { resolveCanonicalProfessionalRole } from "@/lib/org-professional-roles";
import { getPrimaryRole, hasAnyRole, normalizeRoles } from "@/lib/org-roles";
import { prisma } from "@/lib/prisma";

const createMemberSchema = z.object({
  firstName: z.string().trim().min(1, "Nome obbligatorio"),
  lastName: z.string().trim().max(80),
  username: z.string().trim().min(3, "Username obbligatorio"),
  professionalRole: z.string().trim().max(80).optional().or(z.literal("")),
  email: z.string().email("Email non valida"),
  password: z.string().min(8, "Password minima 8 caratteri"),
  roles: z.array(z.enum(["OWNER", "ADMIN", "MANAGER", "WORKER"])).min(1, "Seleziona almeno un ruolo"),
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
  const myMembership = await prisma.orgMember.findFirst({
    where: { userId: session.user.id, org: { slug: orgSlug } },
    include: { org: true },
  });

  if (!myMembership) {
    return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
  }

  const members = await prisma.orgMember.findMany({
    where: { orgId: myMembership.orgId },
    include: {
      user: { select: { id: true, email: true, name: true, firstName: true, lastName: true, professionalRole: true } },
    },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
  });

  return NextResponse.json({ members });
}

export async function POST(request: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const { orgSlug } = await params;
  const myMembership = await prisma.orgMember.findFirst({
    where: { userId: session.user.id, org: { slug: orgSlug } },
    include: { org: true },
  });
  const actorRoles = myMembership ? normalizeRoles([myMembership.role, ...myMembership.roles]) : [];

  if (!myMembership || !hasAnyRole(actorRoles, ["OWNER", "ADMIN", "MANAGER"])) {
    return NextResponse.json({ error: "Permessi insufficienti" }, { status: 403 });
  }

  const parsed = createMemberSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Input non valido" }, { status: 400 });
  }

  const normalizedRoles = normalizeRoles(parsed.data.roles);
  const isAdminLike = hasAnyRole(actorRoles, ["OWNER", "ADMIN"]);
  const safeRoles = isAdminLike
    ? normalizedRoles.filter((role) => role !== "OWNER")
    : normalizedRoles.filter((role) => role === "MANAGER" || role === "WORKER");
  const finalRoles = safeRoles.length ? safeRoles : ["WORKER"];
  const primaryRole = getPrimaryRole(finalRoles);
  const normalizedEmail = parsed.data.email.toLowerCase().trim();
  const professionalRoleResolved = await resolveCanonicalProfessionalRole(myMembership.orgId, parsed.data.professionalRole || "");

  const member = await prisma.$transaction(async (tx) => {
    const existingUser = await tx.user.findUnique({ where: { email: normalizedEmail } });
    const passwordHash = await bcrypt.hash(parsed.data.password, 12);

    const user = existingUser
      ? await tx.user.update({
          where: { id: existingUser.id },
          data: {
            firstName: parsed.data.firstName,
            lastName: parsed.data.lastName,
            professionalRole: professionalRoleResolved,
            name: parsed.data.username,
            passwordHash,
          },
        })
      : await tx.user.create({
          data: {
            email: normalizedEmail,
            firstName: parsed.data.firstName,
            lastName: parsed.data.lastName,
            professionalRole: professionalRoleResolved,
            name: parsed.data.username,
            passwordHash,
          },
        });

    const existingMember = await tx.orgMember.findUnique({
      where: { userId_orgId: { userId: user.id, orgId: myMembership.orgId } },
    });
    if (existingMember) {
      throw new Error("ALREADY_MEMBER");
    }

    const createdMember = await tx.orgMember.create({
      data: {
        orgId: myMembership.orgId,
        userId: user.id,
        role: primaryRole,
        roles: finalRoles,
      },
      include: {
        user: { select: { id: true, email: true, name: true, firstName: true, lastName: true, professionalRole: true } },
      },
    });

    return createdMember;
  }).catch((error: unknown) => {
    if (error instanceof Error && error.message === "ALREADY_MEMBER") {
      return null;
    }
    throw error;
  });

  if (!member) {
    return NextResponse.json({ error: "Utente gia membro di questa organizzazione" }, { status: 409 });
  }

  return NextResponse.json({ member }, { status: 201 });
}
