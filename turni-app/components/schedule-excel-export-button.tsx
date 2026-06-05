"use client";

import { useState } from "react";

type Props = {
  scheduleId: string;
  className?: string;
  size?: "sm" | "md";
};

export function ScheduleExcelExportButton({ scheduleId, className, size = "sm" }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/schedules/${scheduleId}/export-excel`);
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? `Errore ${res.status}`);
      }
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") ?? "";
      const match = /filename="([^"]+)"/.exec(cd);
      const filename = match?.[1] ?? "turni.xlsx";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  const btnClass = size === "sm" ? "btn btn-sm btn-outline-success" : "btn btn-outline-success";

  return (
    <span className="d-inline-flex flex-column align-items-start">
      <button
        type="button"
        className={className ?? btnClass}
        onClick={() => void download()}
        disabled={loading}
        title="Esporta foglio Excel con griglia settimanale e riepilogo con formule"
      >
        {loading ? "Esporto Excel…" : "Esporta Excel"}
      </button>
      {error ? <span className="small text-danger mt-1">{error}</span> : null}
    </span>
  );
}
