"use client";

import { useState } from "react";
import { useAppToast } from "@/components/app-toast-provider";

const PLANS = ["FREE", "STARTER", "PRO", "ENTERPRISE"] as const;
type PlanValue = (typeof PLANS)[number];

type Props = {
  orgId: string;
  initialPlan: string;
};

export function AdminPlanSelect({ orgId, initialPlan }: Props) {
  const { showToast } = useAppToast();
  const initial = (PLANS.includes(initialPlan as PlanValue) ? (initialPlan as PlanValue) : "FREE") satisfies PlanValue;
  const [plan, setPlan] = useState<PlanValue>(initial);
  const [saving, setSaving] = useState(false);

  async function save(next: PlanValue) {
    setPlan(next);
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/orgs/${orgId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: next }),
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) {
        showToast("error", payload.error ?? `Errore HTTP ${res.status}`);
      }
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="d-flex align-items-center gap-2">
      <select
        className="form-select form-select-sm"
        style={{ maxWidth: 160 }}
        value={plan}
        disabled={saving}
        onChange={(e) => void save(e.target.value as PlanValue)}
      >
        {PLANS.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
      {saving ? <span className="small text-secondary">Salvo…</span> : null}
    </div>
  );
}

