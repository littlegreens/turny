"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== password2) {
      setError("Le password non coincidono");
      return;
    }
    if (!token) {
      setError("Link non valido");
      return;
    }

    setLoading(true);
    setError(null);

    const res = await fetch("/api/password/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });

    const data = (await res.json()) as { ok?: boolean; error?: string };
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Reset non riuscito");
      return;
    }

    router.push("/login?reset=1");
    router.refresh();
  }

  if (!token) {
    return (
      <div className="card p-4 border-warning">
        <p className="mb-2">Link incompleto. Usa il link ricevuto via email o richiedine uno nuovo.</p>
        <Link href="/forgot-password" className="btn btn-outline-success">
          Richiedi reset
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card p-4">
      <div className="mb-3">
        <label className="form-label" htmlFor="password">
          Nuova password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="form-control input-underlined"
          required
          minLength={8}
        />
      </div>
      <div className="mb-3">
        <label className="form-label" htmlFor="password2">
          Ripeti password
        </label>
        <input
          id="password2"
          name="password2"
          type="password"
          autoComplete="new-password"
          value={password2}
          onChange={(e) => setPassword2(e.target.value)}
          className="form-control input-underlined"
          required
          minLength={8}
        />
      </div>
      {error ? <p className="text-danger small">{error}</p> : null}
      <button type="submit" disabled={loading} className="btn btn-success w-100">
        {loading ? "Salvataggio..." : "Imposta nuova password"}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <main className="container py-5 d-flex flex-column justify-content-center" style={{ minHeight: "100vh", maxWidth: 560 }}>
      <h1 className="display-6">Nuova password</h1>
      <p className="text-secondary">Scegli una password di almeno 8 caratteri.</p>

      <Suspense fallback={<p className="text-secondary">Caricamento...</p>}>
        <ResetPasswordForm />
      </Suspense>

      <p className="mt-3">
        <Link href="/login" className="link-dark">
          ← Torna al login
        </Link>
      </p>
    </main>
  );
}
