"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { WeekdayPicker } from "@/components/weekday-picker";
import { formatWeekdays } from "@/lib/weekdays";

type Props = {
  calId: string;
  initialWeekdays: number[];
  canEdit: boolean;
};

export function CalendarGeneralSettingsForm({ calId, initialWeekdays, canEdit }: Props) {
  const router = useRouter();
  const [days, setDays] = useState<number[]>(initialWeekdays);
  const [loading, setLoading] = useState(false);

  async function save() {
    if (!canEdit) return;
    setLoading(true);
    await fetch(`/api/calendars/${calId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activeWeekdays: days }),
    });
    setLoading(false);
    router.refresh();
  }

  return (
    <div className="card mb-2">
      <div className="card-body pb-2">
        <h2 className="h6 fw-semibold mb-1">Giorni generali calendario</h2>
        <p className="small text-secondary mb-2">Attivi: {formatWeekdays(days)}</p>
        <WeekdayPicker value={days} onChange={setDays} disabled={!canEdit || loading} />
        <button className="btn btn-success btn-sm mt-1" onClick={save} disabled={!canEdit || loading}>
          {loading ? "Salvataggio..." : "Salva giorni generali"}
        </button>
      </div>
    </div>
  );
}
