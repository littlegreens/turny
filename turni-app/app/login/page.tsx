"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Suspense, useState } from "react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const resetOk = searchParams.get("reset") === "1";

  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const result = await signIn("credentials", {
      login,
      password,
      redirect: false,
    });

    setLoading(false);

    if (!result || result.error) {
      setError("Credenziali non valide");
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <>
      {resetOk ? (
        <div className="alert alert-success py-2 mb-3" role="status">
          Password aggiornata. Ora puoi accedere.
        </div>
      ) : null}

      <form
        onSubmit={handleSubmit}
        className="card p-4"
      >
        <div className="mb-3">
          <label className="form-label" htmlFor="login">
            Username o email
          </label>
          <input
            id="login"
            name="login"
            type="text"
            value={login}
            onChange={(event) => setLogin(event.target.value)}
            className="form-control input-underlined"
            required
          />
        </div>
        <div className="mb-3">
          <label className="form-label" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="form-control input-underlined"
            required
          />
        </div>
        {error ? <p className="text-danger small">{error}</p> : null}
        <button
          type="submit"
          disabled={loading}
          className="btn btn-success w-100"
        >
          {loading ? "Accesso in corso..." : "Accedi"}
        </button>
      </form>

      <p className="mt-2 mb-0">
        <Link href="/forgot-password" className="small link-secondary">
          Password dimenticata?
        </Link>
      </p>

      <p className="mt-3 text-secondary">
        Non hai un account?{" "}
        <Link href="/register" className="link-dark">
          Registrati
        </Link>
      </p>
    </>
  );
}

export default function LoginPage() {
  return (
    <main className="container py-5 d-flex flex-column justify-content-center" style={{ minHeight: "100vh", maxWidth: 560 }}>
      <h1 className="display-6 fw-bold">Accedi a Turny</h1>
      <p className="text-secondary">
        Inserisci username o email, poi la password del tuo account.
      </p>

      <Suspense fallback={<p className="text-secondary">Caricamento...</p>}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
