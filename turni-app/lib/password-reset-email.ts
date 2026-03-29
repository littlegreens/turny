import { Resend } from "resend";

const APP_NAME = "Turny";
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

/**
 * Invia email con link di reset. Mittente: `EMAIL_FROM`.
 * Senza `RESEND_API_KEY` valida: nessuna mail (solo log + uso del link in UI dev).
 */
export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<{ mode: "email" | "console" }> {
  const from = process.env.EMAIL_FROM?.trim() || `${APP_NAME} <onboarding@resend.dev>`;
  const apiKey = process.env.RESEND_API_KEY?.trim();

  const html = `
    <p>Ciao,</p>
    <p>Hai richiesto di reimpostare la password del tuo account ${APP_NAME}.</p>
    <p><a href="${resetUrl}">Clicca qui per impostare una nuova password</a></p>
    <p>Il link scade tra un&apos;ora. Se non sei stato tu, ignora questa email.</p>
    <p style="color:#666;font-size:12px">${resetUrl}</p>
  `.trim();

  if (!apiKey) {
    console.warn(
      `[${APP_NAME}] RESEND_API_KEY assente o vuota: nessuna email inviata. Aggiungi RESEND_API_KEY nel .env oppure usa il link mostrato in pagina (solo sviluppo).`,
    );
    console.info(`[${APP_NAME}] Password reset per ${to} — link:\n${resetUrl}\n`);
    return { mode: "console" };
  }

  const resend = new Resend(apiKey);
  const sendPromise = resend.emails.send({
    from,
    to: [to],
    subject: `Reimposta la password — ${APP_NAME}`,
    html,
  });

  let result: Awaited<ReturnType<typeof resend.emails.send>>;
  try {
    result = await withTimeout(sendPromise, RESEND_TIMEOUT_MS, "Timeout connessione a Resend (controlla rete e API key)");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[Turny] Resend send failed:", msg);
    throw new Error(msg);
  }

  if (result.error) {
    console.error("[Turny] Resend error:", result.error);
    throw new Error(result.error.message || "Invio email non riuscito");
  }

  return { mode: "email" };
}
