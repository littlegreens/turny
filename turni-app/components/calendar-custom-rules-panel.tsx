"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useBeforeUnloadWhen } from "@/hooks/use-unsaved-prompt";

function customRulesToText(json: unknown): string {
  if (json == null || json === undefined) return "";
  if (Array.isArray(json)) {
    return json.filter((x): x is string => typeof x === "string").join("\n");
  }
  if (typeof json === "object" && json !== null && "lines" in json) {
    const lines = (json as { lines?: unknown }).lines;
    if (Array.isArray(lines)) {
      return lines.filter((x): x is string => typeof x === "string").join("\n");
    }
  }
  return "";
}

function textToCustomRules(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

type Props = {
  calId: string;
  initialCustomRules: unknown;
  canEdit: boolean;
};

/**
 * Solo regole in linguaggio naturale a livello calendario.
 * Nome, descrizione, colore e giorni del modello si gestiscono dal popup Modifica nella lista calendari;
 * i giorni attivi per cella sono su ciascun tipo turno.
 */
export function CalendarCustomRulesPanel({ calId, initialCustomRules, canEdit }: Props) {
  const router = useRouter();
  const [rulesText, setRulesText] = useState(() => customRulesToText(initialCustomRules));
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const dirty = useMemo(() => {
    if (!canEdit || loading) return false;
    return rulesText !== customRulesToText(initialCustomRules);
  }, [canEdit, loading, rulesText, initialCustomRules]);

  useBeforeUnloadWhen(dirty && canEdit);

  async function saveRules() {
    if (!canEdit) return;
    setLoading(true);
    setMessage(null);
    const lines = textToCustomRules(rulesText);
    const res = await fetch(`/api/calendars/${calId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customRules: lines.length ? lines : [] }),
    });
    setLoading(false);
    if (!res.ok) {
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      setMessage(payload.error ?? "Salvataggio non riuscito");
      return;
    }
    setMessage("Regole salvate.");
    router.refresh();
  }

  return (
    <section className="card mt-3 border-success border-opacity-50">
      <div className="card-body">
        <h2 className="h5 fw-semibold mb-2">Regole generali (linguaggio naturale)</h2>
        <p className="small text-secondary mb-3">
          Regole che valgono per tutto il calendario (es. equità, priorità di squadra). Una regola per riga. Le regole legate a un
          turno specifico vanno sul singolo tipo turno.
        </p>

        <textarea
          className="form-control font-monospace small"
          rows={8}
          placeholder={"Esempio:\nDopo una notte serve riposo il giorno dopo\nMassimo due notti di seguito per persona"}
          value={rulesText}
          onChange={(e) => setRulesText(e.target.value)}
          disabled={!canEdit || loading}
        />
        <details className="mt-2 small text-secondary">
          <summary className="cursor-pointer user-select-none">Come scriverle bene</summary>
          <ul className="mt-2 mb-0 ps-3">
            <li>Un concetto per riga: più frasi corte funzionano meglio di un paragrafo unico.</li>
            <li>Indica il soggetto (tutti, un ruolo, una persona…).</li>
            <li>Usa numeri espliciti («al massimo 2», «ogni 4 settimane») quando servono.</li>
            <li>Le regole strutturate (max notti, JSON) si configurano altrove; qui resta il linguaggio libero.</li>
          </ul>
        </details>

        <div className="d-flex flex-wrap align-items-center gap-3 mt-4 pt-3 border-top">
          <button type="button" className="btn btn-success px-4" onClick={() => void saveRules()} disabled={!canEdit || loading}>
            {loading ? "Salvataggio..." : "Salva"}
          </button>
          {message ? <span className={`small ${message.includes("non riuscito") ? "text-danger" : "text-success"}`}>{message}</span> : null}
        </div>
      </div>
    </section>
  );
}
