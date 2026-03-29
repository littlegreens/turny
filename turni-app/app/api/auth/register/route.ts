import bcrypt from "bcrypt";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/slug";

const registerSchema = z.object({
  name: z.string().trim().min(2, "Nome troppo corto"),
  orgName: z.string().trim().min(2, "Nome organizzazione troppo corto"),
  email: z.email("Email non valida").transform((value) => value.toLowerCase()),
  password: z
    .string()
    .min(8, "La password deve avere almeno 8 caratteri")
    .max(128, "Password troppo lunga"),
});

async function getUniqueOrgSlug(orgName: string) {
  const base = slugify(orgName) || "organization";
  let slug = base;
  let i = 1;

  while (true) {
    const exists = await prisma.organization.findUnique({ where: { slug } });
    if (!exists) {
      return slug;
    }
    i += 1;
    slug = `${base}-${i}`;
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = registerSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Input non valido" },
        { status: 400 },
      );
    }

    const { name, orgName, email, password } = parsed.data;
    const [firstName, ...lastNameParts] = name.trim().split(/\s+/);
    const lastName = lastNameParts.join(" ");

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return NextResponse.json({ error: "Email gia` registrata" }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const slug = await getUniqueOrgSlug(orgName);

    const created = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name,
          firstName,
          lastName,
          email,
          passwordHash,
        },
      });

      const organization = await tx.organization.create({
        data: {
          name: orgName,
          slug,
          plan: "FREE",
        },
      });

      await tx.orgMember.create({
        data: {
          userId: user.id,
          orgId: organization.id,
          role: "OWNER",
          roles: ["OWNER"],
        },
      });

      return { user, organization };
    });

    return NextResponse.json(
      {
        ok: true,
        userId: created.user.id,
        orgSlug: created.organization.slug,
      },
      { status: 201 },
    );
  } catch {
    return NextResponse.json({ error: "Errore interno" }, { status: 500 });
  }
}
