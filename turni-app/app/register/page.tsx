"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useState } from "react";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        orgName,
        email,
        password,
      }),
    });

    const payload = (await response.json()) as { error?: string };

    if (!response.ok) {
      setLoading(false);
      setError(payload.error ?? "Registrazione non riuscita");
      return;
    }

    const loginResult = await signIn("credentials", {
      login: email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (!loginResult || loginResult.error) {
      router.push("/login");
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="container py-5 d-flex flex-column justify-content-center" style={{ minHeight: "100vh", maxWidth: 560 }}>
      <h1 className="display-6 fw-bold">Crea il tuo account</h1>
      <p className="text-secondary">
        Onboarding iniziale: dopo il login creeremo anche Organization e slug.
      </p>

      <form
        onSubmit={handleSubmit}
        className="card p-4"
      >
        <div className="mb-3">
          <label className="form-label" htmlFor="name">
            Nome
          </label>
          <input
            id="name"
            name="name"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="form-control input-underlined"
            required
          />
        </div>
        <div className="mb-3">
          <label className="form-label" htmlFor="orgName">
            Nome organizzazione
          </label>
          <input
            id="orgName"
            name="orgName"
            type="text"
            value={orgName}
            onChange={(event) => setOrgName(event.target.value)}
            className="form-control input-underlined"
            required
          />
        </div>
        <div className="mb-3">
          <label className="form-label" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
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
            minLength={8}
            required
          />
        </div>
        {error ? <p className="text-danger small">{error}</p> : null}
        <button
          type="submit"
          disabled={loading}
          className="btn btn-success w-100"
        >
          {loading ? "Registrazione..." : "Registrati"}
        </button>
      </form>

      <p className="mt-3 text-secondary">
        Hai gia` un account?{" "}
        <Link href="/login" className="link-dark">
          Accedi
        </Link>
      </p>
    </main>
  );
}
