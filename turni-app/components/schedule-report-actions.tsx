"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmModal } from "@/components/confirm-modal";

type Props = {
  scheduleId: string;
  canEdit: boolean;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
};

export function ScheduleReportActions({ scheduleId, canEdit, status }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [confirmPub, setConfirmPub] = useState(false);
  const [confirmArch, setConfirmArch] = useState(false);

  async function patch(next: "PUBLISHED" | "ARCHIVED") {
    setLoading(true);
    await fetch(`/api/schedules/${scheduleId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    setLoading(false);
    setConfirmPub(false);
    setConfirmArch(false);
    router.refresh();
  }

  if (!canEdit) return null;

  return (
    <div className="d-flex flex-wrap gap-2 align-items-center">
      {status === "DRAFT" ? (
        <button type="button" className="btn btn-success" disabled={loading} onClick={() => setConfirmPub(true)}>
          Pubblica schedule
        </button>
      ) : null}
      {status !== "ARCHIVED" ? (
        <button type="button" className="btn btn-outline-secondary" disabled={loading} onClick={() => setConfirmArch(true)}>
          Archivia
        </button>
      ) : null}

      <ConfirmModal
        open={confirmPub}
        title="Pubblica turni"
        message="Pubblicare questo schedule? Il team potra consultare i turni assegnati (stato PUBLISHED)."
        confirmLabel="Pubblica"
        cancelLabel="Annulla"
        confirmVariant="success"
        loading={loading}
        onCancel={() => setConfirmPub(false)}
        onConfirm={() => void patch("PUBLISHED")}
      />
      <ConfirmModal
        open={confirmArch}
        title="Archivia schedule"
        message="Archiviare questo mese? Potrai ancora consultarlo in elenco."
        confirmLabel="Archivia"
        cancelLabel="Annulla"
        confirmVariant="primary"
        loading={loading}
        onCancel={() => setConfirmArch(false)}
        onConfirm={() => void patch("ARCHIVED")}
      />
    </div>
  );
}
