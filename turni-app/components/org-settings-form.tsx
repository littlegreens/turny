"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  orgSlug: string;
  initialName: string;
  initialDescription: string;
};

export function OrgSettingsForm({ orgSlug, initialName, initialDescription }: Props) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function save() {
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch(`/api/orgs/${orgSlug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description }),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(payload.error ?? "Salvataggio non riuscito");
        return;
      }
      setInfo("Impostazioni salvate.");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="card mt-3">
      <div className="card-body">
        {error ? <div className="alert alert-danger py-2">{error}</div> : null}
        {info ? <div className="alert alert-success py-2">{info}</div> : null}
        <div className="row g-3">
          <div className="col-12">
            <label className="form-label small mb-1">Nome società</label>
            <input
              className="form-control input-underlined"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={loading}
            />
          </div>
          <div className="col-12">
            <label className="form-label small mb-1">Descrizione</label>
            <textarea
              className="form-control input-underlined"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={loading}
              placeholder="Descrizione breve della società..."
            />
          </div>
          <div className="col-12 d-flex justify-content-end">
            <button className="btn btn-success" type="button" onClick={() => void save()} disabled={loading}>
              {loading ? "Salvataggio..." : "Salva"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

