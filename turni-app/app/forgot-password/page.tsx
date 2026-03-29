"use client";

import Link from "next/link";
import { useState } from "react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devResetUrl, setDevResetUrl] = useState<string | null>(null);
  const [sentViaEmail, setSentViaEmail] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setDevResetUrl(null);
    setSentViaEmail(false);

    const res = await fetch("/api/password/forgot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim() }),
    });

    const data = (await res.json()) as {
      ok?: boolean;
      error?: string;
      delivery?: "email" | "console";
      devResetUrl?: string;
    };
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Errore durante la richiesta");
      return;
    }

    if (data.delivery === "email") {
      setSentViaEmail(true);
    }
    if (typeof data.devResetUrl === "string" && data.devResetUrl.length > 0) {
      setDevResetUrl(data.devResetUrl);
    }
    setDone(true);
  }

  async function copyLink() {
    if (!devResetUrl) return;
    try {
      await navigator.clipboard.writeText(devResetUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <main className="container py-5 d-flex flex-column justify-content-center" style={{ minHeight: "100vh", maxWidth: 560 }}>
      <h1 className="display-6 fw-bold">Password dimenticata</h1>
      <p className="text-secondary">
        Inserisci l&apos;email dell&apos;account registrato. In locale, senza chiave Resend valida nel <code className="small">.env</code>, il link di reset
        viene mostrato qui sotto (nessuna mail parte).
      </p>

      {done ? (
        <div className="card p-4 border-success">
          {devResetUrl ? (
            <>
              <div className="alert alert-warning py-2 small mb-3" role="status">
                <strong>Sviluppo locale:</strong> non è stata inviata alcuna email. Usa il link qui sotto (o nel terminale del server). Per inviare mail
                da localhost configura <code>RESEND_API_KEY</code> e <code>EMAIL_FROM</code> su{" "}
                <a href="https://resend.com" target="_blank" rel="noreferrer">
                  resend.com
                </a>
                .
              </div>
              <label className="form-label small text-secondary mb-1">Link reimposta password (1 ora)</label>
              <div className="input-group input-group-sm mb-2">
                <input type="text" readOnly className="form-control font-monospace small" value={devResetUrl} />
                <button type="button" className="btn btn-outline-secondary" onClick={() => void copyLink()}>
                  {copied ? "Copiato" : "Copia"}
                </button>
              </div>
              <p className="mb-3">
                <a href={devResetUrl} className="btn btn-success btn-sm">
                  Apri pagina reset
                </a>
              </p>
            </>
          ) : sentViaEmail ? (
            <p className="mb-3">
              Se l&apos;indirizzo è registrato, abbiamo inviato un&apos;email con il link. Controlla la posta e lo spam. Il mittente è quello impostato in{" "}
              <code className="small">EMAIL_FROM</code>.
            </p>
          ) : (
            <p className="mb-3">
              Se l&apos;indirizzo è registrato, segui le istruzioni ricevute. Se non vedi nulla, verifica di aver usato l&apos;email esatta dell&apos;account
              o prova lo script <code className="small">npm run set-password</code>.
            </p>
          )}
          <Link href="/login" className="btn btn-outline-success">
            Torna al login
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="card p-4">
          <div className="mb-3">
            <label className="form-label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="form-control input-underlined"
              required
            />
          </div>
          {error ? <p className="text-danger small">{error}</p> : null}
          <button type="submit" disabled={loading} className="btn btn-success w-100">
            {loading ? "Invio in corso..." : "Invia link di reset"}
          </button>
        </form>
      )}

      <p className="mt-3">
        <Link href="/login" className="link-dark">
          ← Torna al login
        </Link>
      </p>
    </main>
  );
}
