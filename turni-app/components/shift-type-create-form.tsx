"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAppToast } from "@/components/app-toast-provider";
import { ColorPalettePicker } from "@/components/color-palette-picker";
import { WEEKDAY_OPTIONS } from "@/lib/weekdays";

type Props = {
  calId: string;
  canCreate: boolean;
  roleOptions?: string[];
  onCreated?: () => void;
};

type ShiftTypeRulesDraft = {
  roleSlots?: Array<string | null>;
};

function normalizeRoleSlots(minStaff: number, slots: Array<string | null> | undefined): Array<string | null> {
  const out = Array.from({ length: Math.max(1, minStaff) }, (_, i) => slots?.[i] ?? null);
  return out;
}

export function ShiftTypeCreateForm({ calId, canCreate, roleOptions = [], onCreated }: Props) {
  const router = useRouter();
  const { showToast } = useAppToast();
  const [name, setName] = useState("");
  const [startTime, setStartTime] = useState("07:00");
  const [endTime, setEndTime] = useState("14:00");
  const [minStaff, setMinStaff] = useState(1);
  const [color, setColor] = useState("#E1F5EE");
  const [activeWeekdays, setActiveWeekdays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [roleSlots, setRoleSlots] = useState<Array<string | null>>([null]);
  const [weekdaysOpen, setWeekdaysOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const weekdayRows = [[1, 2, 3], [4, 5, 6], [0]];

  function updateMinStaff(next: number) {
    const v = Math.max(1, Math.floor(next || 1));
    setMinStaff(v);
    setRoleSlots((prev) => normalizeRoleSlots(v, prev));
  }

  function toggleWeekday(day: number) {
    if (activeWeekdays.includes(day)) {
      if (activeWeekdays.length === 1) return;
      setActiveWeekdays((prev) => prev.filter((v) => v !== day));
      return;
    }
    setActiveWeekdays((prev) => [...prev, day]);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canCreate) return;

    setLoading(true);

    const response = await fetch(`/api/calendars/${calId}/shift-types`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        startTime,
        endTime,
        minStaff,
        color,
        activeWeekdays,
        rules: { roleSlots: normalizeRoleSlots(minStaff, roleSlots) } satisfies ShiftTypeRulesDraft,
      }),
    });

    const payload = (await response.json()) as { error?: string };

    if (!response.ok) {
      showToast("error", payload.error ?? "Creazione turno non riuscita");
      setLoading(false);
      return;
    }

    setName("");
    setStartTime("07:00");
    setEndTime("14:00");
    setMinStaff(1);
    setColor("#E1F5EE");
    setActiveWeekdays([1, 2, 3, 4, 5]);
    setRoleSlots([null]);
    setWeekdaysOpen(false);
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
          onChange={(event) => updateMinStaff(Number(event.target.value))}
          required
          disabled={!canCreate || loading}
        />
      </div>
      <div className="col-md-2">
        <ColorPalettePicker value={color} onChange={setColor} disabled={!canCreate || loading} />
      </div>
      <div className="col-md-2 position-relative">
        <label className="form-label small mb-1 d-block">Giorni attivi</label>
        <button
          className="btn btn-outline-success"
          type="button"
          onClick={() => setWeekdaysOpen((v) => !v)}
          disabled={!canCreate || loading}
        >
          <Image src="/calendar.svg" alt="Giorni attivi" width={16} height={16} />
        </button>
        {weekdaysOpen ? (
          <div className="weekdays-popover-dark">
            {weekdayRows.map((row, rowIdx) => (
              <div key={rowIdx} className="weekday-mini-row">
                {row.map((day) => {
                  const item = WEEKDAY_OPTIONS.find((opt) => opt.value === day);
                  if (!item) return null;
                  const active = activeWeekdays.includes(day);
                  return (
                    <button key={day} type="button" className={`weekday-mini-square ${active ? "active" : ""}`} onClick={() => toggleWeekday(day)}>
                      {item.label}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        ) : null}
      </div>
      <div className="col-12">
        <label className="form-label small mb-1">Ruoli per slot</label>
        <div className="shift-role-slot-rows">
          {normalizeRoleSlots(minStaff, roleSlots).map((v, idx) => (
            <div key={idx} className="shift-role-slot-row">
              <span className="shift-role-slot-pin shift-role-slot-pin--slot">Slot {idx + 1}</span>
              <span
                className={`shift-role-slot-pin ${v ? "shift-role-slot-pin--role" : "shift-role-slot-pin--neutral"}`}
                title={v ?? "Indifferente"}
              >
                {v ?? "Indifferente"}
              </span>
              <select
                className="form-select form-select-sm shift-role-slot-select"
                aria-label={`Ruolo slot ${idx + 1}`}
                value={v ?? ""}
                onChange={(e) => {
                  const next = e.target.value ? e.target.value : null;
                  setRoleSlots((prev) => {
                    const out = normalizeRoleSlots(minStaff, prev);
                    out[idx] = next;
                    return out;
                  });
                }}
                disabled={!canCreate || loading}
              >
                <option value="">Indifferente</option>
                {roleOptions.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
        <div className="small text-secondary mt-1">
          Se un ruolo è impostato, in generazione il motore prova a garantire almeno quel numero di persone con quel ruolo.
        </div>
      </div>
      <div className="col-12">
        <button className="btn btn-success" type="submit" disabled={!canCreate || loading}>
          {loading ? "Creazione..." : "Aggiungi"}
        </button>
      </div>
      {!canCreate ? <p className="small text-secondary col-12">Il tuo ruolo non puo` creare turni.</p> : null}
    </form>
  );
}
