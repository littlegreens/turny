"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmModal } from "@/components/confirm-modal";

type Props = {
  scheduleId: string;
  /** Se true, dopo il ripristino vai a /{orgSlug}/turni */
  orgSlug?: string;
  className?: string;
  label?: string;
};

export function ScheduleRipristinaButton({
  scheduleId,
  orgSlug,
  className = "btn btn-sm btn-outline-success",
  label = "Ripristina nei turni",
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function confirm() {
    setLoading(true);
    const res = await fetch(`/api/schedules/${scheduleId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "PUBLISHED" }),
    });
    setLoading(false);
    setOpen(false);
    if (res.ok) {
      if (orgSlug) router.push(`/${orgSlug}/turni`);
      router.refresh();
    }
  }

  return (
    <>
      <button type="button" className={className} disabled={loading} onClick={() => setOpen(true)}>
        {loading ? "..." : label}
      </button>
      <ConfirmModal
        open={open}
        title="Ripristina schedule"
        message="Il periodo tornerà visibile nell'elenco turni come pubblicato."
        confirmLabel="Ripristina"
        cancelLabel="Annulla"
        confirmVariant="success"
        loading={loading}
        onCancel={() => setOpen(false)}
        onConfirm={() => void confirm()}
      />
    </>
  );
}
