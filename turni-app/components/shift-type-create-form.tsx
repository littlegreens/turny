"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ColorPalettePicker } from "@/components/color-palette-picker";

type Props = {
  calId: string;
  canCreate: boolean;
  onCreated?: () => void;
};

export function ShiftTypeCreateForm({ calId, canCreate, onCreated }: Props) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [startTime, setStartTime] = useState("07:00");
  const [endTime, setEndTime] = useState("14:00");
  const [minStaff, setMinStaff] = useState(1);
  const [color, setColor] = useState("#E1F5EE");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canCreate) return;

    setLoading(true);
    setError(null);

    const response = await fetch(`/api/calendars/${calId}/shift-types`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        startTime,
        endTime,
        minStaff,
        color,
      }),
    });

    const payload = (await response.json()) as { error?: string };

    if (!response.ok) {
      setError(payload.error ?? "Creazione turno non riuscita");
      setLoading(false);
      return;
    }

    setName("");
    setStartTime("07:00");
    setEndTime("14:00");
    setMinStaff(1);
    setColor("#E1F5EE");
    setLoading(false);
    onCreated?.();
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="row g-2 align-items-end mt-3">
      <div className="col-md-4">
        <label className="form-label small mb-1">Nome turno</label>
        <input
          className="form-control input-underlined"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          disabled={!canCreate || loading}
        />
      </div>
      <div className="col-md-2">
        <label className="form-label small mb-1">Inizio</label>
        <input
          type="time"
          className="form-control input-underlined"
          value={startTime}
          onChange={(event) => setStartTime(event.target.value)}
          required
          disabled={!canCreate || loading}
        />
      </div>
      <div className="col-md-2">
        <label className="form-label small mb-1">Fine</label>
        <input
          type="time"
          className="form-control input-underlined"
          value={endTime}
          onChange={(event) => setEndTime(event.target.value)}
          required
          disabled={!canCreate || loading}
        />
      </div>
      <div className="col-md-2">
        <label className="form-label small mb-1">Min staff</label>
        <input
          type="number"
          min={1}
          className="form-control input-underlined"
          value={minStaff}
          onChange={(event) => setMinStaff(Number(event.target.value))}
          required
          disabled={!canCreate || loading}
        />
      </div>
      <div className="col-md-2">
        <ColorPalettePicker value={color} onChange={setColor} disabled={!canCreate || loading} />
      </div>
      <div className="col-12">
        <button className="btn btn-success" type="submit" disabled={!canCreate || loading}>
          {loading ? "Creazione..." : "Aggiungi turno"}
        </button>
      </div>
      {error ? <p className="text-danger small col-12">{error}</p> : null}
      {!canCreate ? <p className="small text-secondary col-12">Il tuo ruolo non puo` creare turni.</p> : null}
    </form>
  );
}
