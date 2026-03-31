"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAppToast } from "@/components/app-toast-provider";

type Props = {
  orgSlug: string;
  initialName: string;
  initialDescription: string;
};

export function OrgSettingsForm({ orgSlug, initialName, initialDescription }: Props) {
  const router = useRouter();
  const { showToast } = useAppToast();
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [loading, setLoading] = useState(false);

  async function save() {
    setLoading(true);
    try {
      const res = await fetch(`/api/orgs/${orgSlug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description }),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        showToast("error", payload.error ?? "Salvataggio non riuscito");
        return;
      }
      showToast("success", "Impostazioni salvate.");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="card mt-3">
      <div className="card-body">
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
            <div className="form-text">Massimo 400 caratteri.</div>
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

