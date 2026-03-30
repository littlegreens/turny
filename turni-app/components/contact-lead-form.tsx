"use client";

import { useState } from "react";

type Payload = {
  firstName: string;
  lastName: string;
  email: string;
  message: string;
};

export function ContactLeadForm() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit() {
    setLoading(true);
    setStatus(null);
    const body: Payload = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim(),
      message: message.trim(),
    };
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string; ok?: boolean };
      if (!res.ok) {
        setStatus({ ok: false, text: payload.error ?? `Errore HTTP ${res.status}` });
      } else {
        setStatus({ ok: true, text: "Messaggio inviato. Ti ricontatto a breve." });
        setFirstName("");
        setLastName("");
        setEmail("");
        setMessage("");
      }
    } catch (e) {
      setStatus({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setLoading(false);
    }
  }

  const disabled =
    loading ||
    firstName.trim().length < 2 ||
    lastName.trim().length < 2 ||
    !email.includes("@") ||
    message.trim().length < 10;

  return (
    <div className="d-grid gap-2">
      <div className="row g-2">
        <div className="col-12 col-md-6">
          <label className="form-label mb-1 text-white" style={{ textShadow: "0 2px 18px rgba(0,0,0,0.35)" }}>
            Nome
          </label>
          <input className="form-control" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Mario" />
        </div>
        <div className="col-12 col-md-6">
          <label className="form-label mb-1 text-white" style={{ textShadow: "0 2px 18px rgba(0,0,0,0.35)" }}>
            Cognome
          </label>
          <input className="form-control" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Rossi" />
        </div>
      </div>
      <div>
        <label className="form-label mb-1 text-white" style={{ textShadow: "0 2px 18px rgba(0,0,0,0.35)" }}>
          Email
        </label>
        <input className="form-control" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="mario@azienda.it" />
      </div>
      <div>
        <label className="form-label mb-1 text-white" style={{ textShadow: "0 2px 18px rgba(0,0,0,0.35)" }}>
          Messaggio
        </label>
        <textarea
          className="form-control"
          rows={4}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Dimmi di che realtà si tratta e quante persone/turni gestite."
        />
      </div>
      <div className="d-flex align-items-center gap-2 flex-wrap">
        <button type="button" className="btn btn-success px-4" disabled={disabled} onClick={() => void submit()}>
          {loading ? "Invio..." : "Invia"}
        </button>
        {status ? (
          <span className={`small ${status.ok ? "text-success" : "text-danger"}`} style={{ textShadow: "0 2px 18px rgba(0,0,0,0.35)" }}>
            {status.text}
          </span>
        ) : null}
      </div>
      <p className="small mb-0" style={{ color: "rgba(255,255,255,0.82)", textShadow: "0 2px 18px rgba(0,0,0,0.35)" }}>
        Invio a: <strong>shiftswithlove@gmail.com</strong>
      </p>
    </div>
  );
}

