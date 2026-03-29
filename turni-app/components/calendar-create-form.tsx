"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ColorPalettePicker } from "@/components/color-palette-picker";

type Props = {
  orgSlug: string;
  canCreate: boolean;
  onCreated?: () => void;
};

export function CalendarCreateForm({ orgSlug, canCreate, onCreated }: Props) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("#3B8BD4");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canCreate) return;

    setLoading(true);
    setError(null);

    const response = await fetch(`/api/orgs/${orgSlug}/calendars`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        description,
        color,
        timezone: "Europe/Rome",
      }),
    });

    const payload = (await response.json()) as { error?: string };

    if (!response.ok) {
      setError(payload.error ?? "Creazione calendario non riuscita");
      setLoading(false);
      return;
    }

    setName("");
    setDescription("");
    setColor("#3B8BD4");
    setLoading(false);
    router.refresh();
    onCreated?.();
  }

  return (
    <form onSubmit={handleSubmit} className="mt-2 row g-3">
      <div className="col-12">
        <label className="form-label small mb-1">Nome calendario</label>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="form-control input-underlined"
          required
          disabled={!canCreate || loading}
        />
      </div>
      <div className="col-12">
        <label className="form-label small mb-1">Descrizione</label>
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          className="form-control input-underlined"
          rows={3}
          placeholder="Descrizione calendario (opzionale)"
          disabled={!canCreate || loading}
        />
      </div>
      <div className="col-12">
        <label className="form-label small mb-2 d-block">Colore</label>
        <ColorPalettePicker value={color} onChange={setColor} disabled={!canCreate || loading} />
      </div>
      <div className="col-12 d-grid pt-1">
        <button
          type="submit"
          disabled={!canCreate || loading}
          className="btn btn-success"
        >
          {loading ? "Creazione..." : "Crea calendario"}
        </button>
      </div>
      {error ? <p className="text-danger small col-12">{error}</p> : null}
      {!canCreate ? (
        <p className="small text-secondary col-12">
          Il tuo ruolo non puo` creare calendari.
        </p>
      ) : null}
    </form>
  );
}
