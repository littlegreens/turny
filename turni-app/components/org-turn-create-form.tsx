"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAppToast } from "@/components/app-toast-provider";

type CalendarOption = { id: string; name: string };

type Props = {
  orgSlug: string;
  calendars: CalendarOption[];
  canCreate: boolean;
  onCreated?: () => void;
};

function monthName(month: number) {
  return new Intl.DateTimeFormat("it-IT", { month: "long" }).format(new Date(2026, month - 1, 1));
}

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, idx) => {
  const value = idx + 1;
  return { value, label: monthName(value) };
});

export function OrgTurnCreateForm({ orgSlug, calendars, canCreate, onCreated }: Props) {
  const router = useRouter();
  const { showToast } = useAppToast();
  const now = new Date();
  const [calendarId, setCalendarId] = useState(calendars[0]?.id ?? "");
  const [periodType, setPeriodType] = useState<"MONTHLY" | "WEEKLY" | "CUSTOM">("MONTHLY");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [loading, setLoading] = useState(false);

  function addDays(dateIso: string, days: number) {
    const d = new Date(`${dateIso}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canCreate || !calendarId) return;
    setLoading(true);

    const requestPayload =
      periodType === "MONTHLY"
        ? { periodType, year, month }
        : {
            periodType,
            startDate,
            endDate: periodType === "WEEKLY" && startDate ? addDays(startDate, 6) : endDate,
          };

    const response = await fetch(`/api/calendars/${calendarId}/schedules`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestPayload),
    });
    const payload = (await response.json()) as { error?: string; schedule?: { id: string } };
    setLoading(false);

    if (!response.ok || !payload.schedule?.id) {
      showToast("error", payload.error ?? "Creazione turno non riuscita");
      return;
    }

    onCreated?.();
    router.push(`/${orgSlug}/${calendarId}/schedules/${payload.schedule.id}/grid`);
  }

  return (
    <form onSubmit={handleSubmit} className="row g-3 pb-2">
      <div className="col-12">
        <p className="small text-secondary mb-1">
          Scegli il <strong>calendario</strong> e il <strong>tipo di periodo</strong> dei turni: mensile, settimanale o intervallo date — dipende da come lavora quel calendario, non da una regola fissa.
          Per il settimanale, la data fine viene calcolata dalla data inizio.
        </p>
      </div>
      <div className="col-12">
        <label className="form-label small mb-1">Calendario</label>
        <select
          className="form-select input-underlined"
          value={calendarId}
          onChange={(e) => setCalendarId(e.target.value)}
          disabled={!canCreate || loading || calendars.length === 0}
        >
          {calendars.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div className="col-12">
        <label className="form-label small mb-1">Periodo</label>
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
          <div className="col-md-6">
            <label className="form-label small mb-1">Anno</label>
            <input
              type="number"
              className="form-control input-underlined"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              disabled={!canCreate || loading}
            />
          </div>
          <div className="col-md-6">
            <label className="form-label small mb-1">Mese</label>
            <select
              className="form-select input-underlined"
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              disabled={!canCreate || loading}
            >
              {MONTH_OPTIONS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        </>
      ) : (
        <>
          <div className="col-md-6">
            <label className="form-label small mb-1">Data inizio</label>
            <input
              type="date"
              className="form-control input-underlined"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              disabled={!canCreate || loading}
            />
          </div>
          <div className="col-md-6">
            <label className="form-label small mb-1">Data fine</label>
            <input
              type="date"
              className="form-control input-underlined"
              value={periodType === "WEEKLY" && startDate ? addDays(startDate, 6) : endDate}
              onChange={(e) => setEndDate(e.target.value)}
              disabled={!canCreate || loading || periodType === "WEEKLY"}
            />
          </div>
        </>
      )}
      <div className="col-12 d-grid pt-1">
        <button className="btn btn-success" type="submit" disabled={!canCreate || loading || !calendarId}>
          {loading ? "Creazione..." : "Crea turno"}
        </button>
      </div>
    </form>
  );
}

