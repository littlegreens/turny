import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import bcrypt from "bcrypt";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const patchSchema = z.object({
  firstName: z.string().trim().min(1, "Nome obbligatorio").max(80),
  lastName: z.string().trim().max(80).optional().or(z.literal("")),
  email: z.string().email("Email non valida"),
  password: z.union([z.string().min(8, "Password minima 8 caratteri"), z.literal("")]).optional(),
});

export async function PATCH(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Input non valido";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const normalizedEmail = parsed.data.email.toLowerCase().trim();
  const existing = await prisma.user.findFirst({
    where: { email: normalizedEmail, NOT: { id: session.user.id } },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json({ error: "Email già utilizzata da un altro account" }, { status: 400 });
  }

  const fn = parsed.data.firstName;
  const ln = (parsed.data.lastName ?? "").trim();
  const displayName = `${fn} ${ln}`.trim() || normalizedEmail;

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      firstName: fn,
      lastName: ln,
      name: displayName,
      email: normalizedEmail,
      ...(parsed.data.password && parsed.data.password.length >= 8
        ? { passwordHash: await bcrypt.hash(parsed.data.password, 12) }
        : {}),
    },
  });

  return NextResponse.json({ ok: true });
}
