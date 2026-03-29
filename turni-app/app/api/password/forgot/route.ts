import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { sendPasswordResetEmail } from "@/lib/password-reset-email";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({
  email: z.string().trim().email(),
});

/** Risposta sempre generica per non rivelare se l'email esiste. */
export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: true });
  }

  const email = parsed.data.email.toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true },
  });

  if (!user) {
    return NextResponse.json({ ok: true });
  }

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

  await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      token,
      expiresAt,
    },
  });

  const baseUrl = process.env.NEXTAUTH_URL?.replace(/\/$/, "") || "http://localhost:3000";
  const resetUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`;

  let delivery: "email" | "console";
  try {
    const result = await sendPasswordResetEmail(user.email, resetUrl);
    delivery = result.mode;
  } catch (e) {
    console.error("[password/forgot] email error", e);
    const hint =
      e instanceof Error && e.message.includes("Timeout")
        ? " Timeout: verifica rete, firewall o chiave Resend."
        : "";
    return NextResponse.json(
      { ok: false, error: `Invio email non riuscito.${hint} Controlla RESEND_API_KEY e EMAIL_FROM nel .env.` },
      { status: 500 },
    );
  }

  const isDev = process.env.NODE_ENV === "development";
  /** In locale senza Resend l’utente vede il link in pagina (non solo nel terminale). */
  if (isDev && delivery === "console") {
    return NextResponse.json({ ok: true, delivery: "console", devResetUrl: resetUrl });
  }

  return NextResponse.json({ ok: true, delivery });
}
