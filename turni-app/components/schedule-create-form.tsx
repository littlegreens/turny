"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAppToast } from "@/components/app-toast-provider";

type Props = {
  calId: string;
  canCreate: boolean;
};

export function ScheduleCreateForm({ calId, canCreate }: Props) {
  const router = useRouter();
  const { showToast } = useAppToast();
  const now = new Date();
  const [periodType, setPeriodType] = useState<"MONTHLY" | "WEEKLY" | "CUSTOM">("MONTHLY");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canCreate) return;
    setLoading(true);

    const response = await fetch(`/api/calendars/${calId}/schedules`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ periodType, year, month, startDate, endDate }),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      showToast("error", payload.error ?? "Creazione bozza non riuscita");
      setLoading(false);
      return;
    }
    setLoading(false);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="row g-2 align-items-end mt-2">
      <div className="col-md-3">
        <label className="form-label small mb-1">Tipo turno</label>
        <select
          className="form-select input-underlined"
          value={periodType}
          onChange={(e) => setPeriodType(e.target.value as "MONTHLY" | "WEEKLY" | "CUSTOM")}
          disabled={!canCreate || loading}
        >
          <option value="MONTHLY">Mensile</option>
          <option value="WEEKLY">Settimanale</option>
          <option value="CUSTOM">Custom</option>
        </select>
      </div>
      {periodType === "MONTHLY" ? (
        <>
      <div className="col-md-2">
        <label className="form-label small mb-1">Anno</label>
        <input type="number" className="form-control input-underlined" value={year} onChange={(e) => setYear(Number(e.target.value))} disabled={!canCreate || loading} />
      </div>
      <div className="col-md-2">
        <label className="form-label small mb-1">Mese</label>
        <input type="number" min={1} max={12} className="form-control input-underlined" value={month} onChange={(e) => setMonth(Number(e.target.value))} disabled={!canCreate || loading} />
      </div>
        </>
      ) : (
        <>
          <div className="col-md-3">
            <label className="form-label small mb-1">Data inizio</label>
            <input
              type="date"
              className="form-control input-underlined"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              disabled={!canCreate || loading}
            />
          </div>
          <div className="col-md-3">
            <label className="form-label small mb-1">Data fine</label>
            <input
              type="date"
              className="form-control input-underlined"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              disabled={!canCreate || loading}
            />
          </div>
        </>
      )}
      <div className="col-md-3 d-flex justify-content-md-start">
        <button className="btn btn-success" type="submit" disabled={!canCreate || loading}>
          {loading ? "Creazione..." : "Crea turno"}
        </button>
      </div>
    </form>
  );
}
