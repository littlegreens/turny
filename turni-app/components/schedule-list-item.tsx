"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ScheduleRipristinaButton } from "@/components/schedule-ripristina-button";

type Props = {
  orgSlug: string;
  calId: string;
  schedule: {
    id: string;
    year: number;
    month: number;
    status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
    generationLog: unknown;
  };
  canEdit: boolean;
};

function monthLabel(month: number) {
  return new Intl.DateTimeFormat("it-IT", { month: "long" }).format(new Date(2026, month - 1, 1));
}

function schedulePeriodLabel(schedule: Props["schedule"]) {
  const meta = (schedule.generationLog ?? {}) as { periodType?: string; startDate?: string; endDate?: string };
  if (meta.periodType === "WEEKLY" || meta.periodType === "CUSTOM") {
    return `${meta.periodType === "WEEKLY" ? "Settimanale" : "Custom"} - dal ${meta.startDate ?? "?"} al ${meta.endDate ?? "?"}`;
  }
  return `Mensile - ${monthLabel(schedule.month)} ${schedule.year}`;
}

function statusLabel(status: Props["schedule"]["status"]) {
  if (status === "DRAFT") return "Bozza";
  if (status === "PUBLISHED") return "Pubblicato";
  return "Archiviato";
}

export function ScheduleListItem({ orgSlug, calId, schedule, canEdit }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function setStatus(status: "DRAFT" | "PUBLISHED" | "ARCHIVED") {
    setLoading(true);
    await fetch(`/api/schedules/${schedule.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setLoading(false);
    router.refresh();
  }

  return (
    <li className="border rounded p-3 d-flex justify-content-between align-items-center gap-2 flex-wrap">
      <div>
        <p className="fw-semibold mb-0">{schedulePeriodLabel(schedule)}</p>
        <span className="small text-secondary">Stato: {statusLabel(schedule.status)}</span>
      </div>
      <div className="d-flex align-items-center gap-2 flex-wrap">
        <Link href={`/${orgSlug}/${calId}/schedules/${schedule.id}/grid`} className="btn btn-sm btn-success">
          Configuratore
        </Link>
        <Link href={`/${orgSlug}/${calId}/schedules/${schedule.id}/report`} className="btn btn-sm btn-outline-success">
          Report
        </Link>
        {canEdit && schedule.status === "ARCHIVED" ? (
          <ScheduleRipristinaButton scheduleId={schedule.id} orgSlug={orgSlug} />
        ) : null}
        {canEdit && schedule.status !== "PUBLISHED" && schedule.status !== "ARCHIVED" ? (
          <button className="btn btn-sm btn-success" onClick={() => setStatus("PUBLISHED")} disabled={loading}>
            Pubblica
          </button>
        ) : null}
      </div>
    </li>
  );
}
