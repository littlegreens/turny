"use client";

import { useState } from "react";

const PLANS = ["FREE", "STARTER", "PRO", "ENTERPRISE"] as const;
type PlanValue = (typeof PLANS)[number];

type Props = {
  orgId: string;
  initialPlan: string;
};

export function AdminPlanSelect({ orgId, initialPlan }: Props) {
  const initial = (PLANS.includes(initialPlan as PlanValue) ? (initialPlan as PlanValue) : "FREE") satisfies PlanValue;
  const [plan, setPlan] = useState<PlanValue>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(next: PlanValue) {
    setPlan(next);
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/orgs/${orgId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: next }),
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(payload.error ?? `Errore HTTP ${res.status}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
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
      {error ? <span className="small text-danger">{error}</span> : null}
    </div>
  );
}

