"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ColorPalettePicker } from "@/components/color-palette-picker";

type Props = {
  calId: string;
  initialName: string;
  initialDescription: string;
  initialColor: string;
  canEdit: boolean;
};

export function CalendarConfigureForm({ calId, initialName, initialDescription, initialColor, canEdit }: Props) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [color, setColor] = useState(initialColor);
  const [loading, setLoading] = useState(false);

  async function save() {
    if (!canEdit) return;
    setLoading(true);
    await fetch(`/api/calendars/${calId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description, color }),
    });
    setLoading(false);
    router.refresh();
  }

  return (
    <section className="card mt-3">
      <div className="card-body">
        <h2 className="h5 fw-semibold mb-2">Configurazione calendario</h2>
        <div className="row g-3">
          <div className="col-md-6">
            <label className="form-label small mb-1">Titolo</label>
            <input className="form-control input-underlined" value={name} onChange={(e) => setName(e.target.value)} disabled={!canEdit || loading} />
          </div>
          <div className="col-md-6">
            <label className="form-label small mb-1">Descrizione</label>
            <textarea className="form-control input-underlined" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} disabled={!canEdit || loading} />
          </div>
          <div className="col-12">
            <label className="form-label small mb-2 d-block">Colore</label>
            <ColorPalettePicker value={color} onChange={setColor} disabled={!canEdit || loading} />
          </div>
          <div className="col-12 d-flex justify-content-end">
            <button className="btn btn-success" onClick={() => void save()} disabled={!canEdit || loading}>
              {loading ? "Salvataggio..." : "Salva configurazione"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

