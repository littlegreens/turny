import { NextResponse } from "next/server";
import { Resend } from "resend";
import { z } from "zod";

const schema = z.object({
  firstName: z.string().trim().min(2).max(80),
  lastName: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(200),
  message: z.string().trim().min(10).max(4000),
});

const TO = "shiftswithlove@gmail.com";
const RESEND_TIMEOUT_MS = 25_000;

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(message)), ms);
    promise
      .then((v) => {
        clearTimeout(t);
        resolve(v);
      })
      .catch((e) => {
        clearTimeout(t);
        reject(e);
      });
  });
}

export async function POST(req: Request) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim() || "Turny <onboarding@resend.dev>";
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "Invio non configurato: manca RESEND_API_KEY nel .env." },
      { status: 500 },
    );
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Body non valido" }, { status: 400 });
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Dati non validi" }, { status: 400 });
  }

  const { firstName, lastName, email, message } = parsed.data;
  const subject = `Lead Turny — ${firstName} ${lastName}`;
  const html = `
    <h3>Richiesta contatto</h3>
    <p><strong>Nome:</strong> ${firstName} ${lastName}</p>
    <p><strong>Email:</strong> ${email}</p>
    <p><strong>Messaggio:</strong></p>
    <pre style="white-space:pre-wrap;font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace">${message}</pre>
  `.trim();

  const resend = new Resend(apiKey);
  const sendPromise = resend.emails.send({
    from,
    to: [TO],
    replyTo: email,
    subject,
    html,
  });

  try {
    const result = await withTimeout(sendPromise, RESEND_TIMEOUT_MS, "Timeout invio email (Resend)");
    if (typeof result === "object" && result !== null && "error" in result && (result as { error?: unknown }).error) {
      return NextResponse.json({ ok: false, error: "Invio email non riuscito" }, { status: 502 });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}

