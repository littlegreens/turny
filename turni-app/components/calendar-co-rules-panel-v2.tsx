"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmModal } from "@/components/confirm-modal";
import { useAppToast } from "@/components/app-toast-provider";

const DOW_LABELS = ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];

type MemberOpt = { id: string; label: string; professionalRole: string; memberColor?: string | null };
type RuleDraft = {
  id: string;
  name: string;
  kind: "ALWAYS_WITH" | "NEVER_WITH";
  ifSelectors: string[];
  thenSelectors: string[];
};
type DowRuleDraft = {
  id: string;
  name: string;
  kind: "DAY_IMPLIES_DAY" | "DAY_EXCLUDES_DAY";
  fromDow: number;
  toDow: number;
};

type Props = { calId: string; canEdit: boolean; initialCalendarRules: unknown; members: MemberOpt[] };

export function CalendarCoRulesPanelV2({ calId, canEdit, initialCalendarRules, members }: Props) {
  const router = useRouter();
  const { showToast } = useAppToast();
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"ALWAYS_WITH" | "NEVER_WITH">("ALWAYS_WITH");
  const [ifSelectors, setIfSelectors] = useState<string[]>([]);
  const [thenSelectors, setThenSelectors] = useState<string[]>([]);
  const [ifQuery, setIfQuery] = useState("");
  const [thenQuery, setThenQuery] = useState("");
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [rules, setRules] = useState<RuleDraft[]>(() => {
    const raw = (initialCalendarRules ?? {}) as { coPresenceRules?: unknown };
    const list = Array.isArray(raw.coPresenceRules) ? raw.coPresenceRules : [];
    return list
      .filter((r): r is Record<string, unknown> => Boolean(r && typeof r === "object"))
      .map((r) => ({
        id: String(r.id || crypto.randomUUID()),
        name: String(r.name || "Regola"),
        kind: r.kind === "NEVER_WITH" ? "NEVER_WITH" : ("ALWAYS_WITH" as const),
        ifSelectors: Array.isArray(r.ifSelectors) ? r.ifSelectors.map(String).filter(Boolean) : [],
        thenSelectors: Array.isArray(r.thenSelectors) ? r.thenSelectors.map(String).filter(Boolean) : [],
      }))
      .filter((r) => r.ifSelectors.length && r.thenSelectors.length);
  });

  // ── Dow rules state ───────────────────────────────────────────
  const [dowRules, setDowRules] = useState<DowRuleDraft[]>(() => {
    const raw = (initialCalendarRules ?? {}) as { dowRules?: unknown };
    const list = Array.isArray(raw.dowRules) ? raw.dowRules : [];
    return list
      .filter((r): r is Record<string, unknown> => Boolean(r && typeof r === "object"))
      .map((r) => ({
        id: String(r.id || crypto.randomUUID()),
        name: String(r.name || "Regola giorno"),
        kind: r.kind === "DAY_EXCLUDES_DAY" ? "DAY_EXCLUDES_DAY" : ("DAY_IMPLIES_DAY" as const),
        fromDow: Number(r.fromDow ?? 6),
        toDow: Number(r.toDow ?? 0),
      }));
  });
  const [restDaysAfterNight, setRestDaysAfterNight] = useState<number>(() => {
    const raw = (initialCalendarRules ?? {}) as { rest_days_after_night?: unknown };
    const v = Number(raw.rest_days_after_night ?? 1);
    return v >= 2 ? 2 : 1;
  });
  const [dowModalOpen, setDowModalOpen] = useState(false);
  const [dowEditingId, setDowEditingId] = useState<string | null>(null);
  const [dowName, setDowName] = useState("");
  const [dowKind, setDowKind] = useState<"DAY_IMPLIES_DAY" | "DAY_EXCLUDES_DAY">("DAY_IMPLIES_DAY");
  const [dowFromDow, setDowFromDow] = useState(6);
  const [dowToDow, setDowToDow] = useState(0);
  const [deleteDowTargetId, setDeleteDowTargetId] = useState<string | null>(null);

  const roleOptions = useMemo(() => {
    const set = new Set<string>();
    for (const m of members) if (m.professionalRole?.trim()) set.add(m.professionalRole.trim());
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [members]);

  const selectorOptions = useMemo(() => {
    const out: Array<{ key: string; label: string }> = [];
    for (const r of roleOptions) out.push({ key: `ROLE:${r}`, label: `Ruolo: ${r}` });
    for (const m of members) out.push({ key: `MEMBER:${m.id}`, label: m.label });
    return out;
  }, [members, roleOptions]);

  function selectorLabel(sel: string) {
    if (sel.startsWith("ROLE:")) return `Ruolo: ${sel.slice(5)}`;
    const id = sel.startsWith("MEMBER:") ? sel.slice(7) : sel;
    return members.find((m) => m.id === id)?.label ?? sel;
  }
  function selectorColor(sel: string): string | null {
    if (!sel.startsWith("MEMBER:")) return null;
    const id = sel.slice(7);
    return members.find((m) => m.id === id)?.memberColor ?? null;
  }

  function ruleDescription(r: RuleDraft): string {
    const ifLabels = r.ifSelectors.map(selectorLabel).join(", ");
    const thenLabels = r.thenSelectors.map(selectorLabel).join(", ");
    const verb = r.kind === "ALWAYS_WITH" ? "deve stare con" : "non deve stare con";
    return `${ifLabels} ${verb} ${thenLabels}`;
  }

  function openModal(ruleId: string | null) {
    if (!ruleId) {
      setEditingId(null);
      setName("");
      setKind("ALWAYS_WITH");
      setIfSelectors([]);
      setThenSelectors([]);
      setIfQuery("");
      setThenQuery("");
      setModalOpen(true);
      return;
    }
    const r = rules.find((x) => x.id === ruleId);
    if (!r) return;
    setEditingId(r.id);
    setName(r.name);
    setKind(r.kind);
    setIfSelectors(r.ifSelectors);
    setThenSelectors(r.thenSelectors);
    setIfQuery("");
    setThenQuery("");
    setModalOpen(true);
  }

  async function persist(nextRules: RuleDraft[], nextDowRules?: DowRuleDraft[], nextRestDays?: number) {
    setLoading(true);
    try {
      const prev = (initialCalendarRules ?? {}) as Record<string, unknown>;
      const dows = nextDowRules ?? dowRules;
      const rdays = nextRestDays ?? restDaysAfterNight;
      const next = {
        ...prev,
        coPresenceRules: nextRules.map((r) => ({
          id: r.id,
          name: r.name.trim(),
          kind: r.kind,
          ifSelectors: [...new Set(r.ifSelectors)].filter(Boolean),
          thenSelectors: [...new Set(r.thenSelectors)].filter(Boolean),
        })),
        dowRules: dows.map((r) => ({
          id: r.id,
          name: r.name.trim(),
          kind: r.kind,
          fromDow: r.fromDow,
          toDow: r.toDow,
        })),
        rest_days_after_night: rdays,
      };
      const res = await fetch(`/api/calendars/${calId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rules: next }),
      });
      const rawText = await res.text().catch(() => "");
      let payload: { error?: string } = {};
      try { payload = JSON.parse(rawText) as { error?: string }; } catch { /* not json */ }
      if (!res.ok) {
        showToast("error", payload.error ?? `Errore ${res.status}`);
        return false;
      }
      setRules(nextRules);
      if (nextDowRules) setDowRules(nextDowRules);
      if (nextRestDays !== undefined) setRestDaysAfterNight(nextRestDays);
      showToast("success", "Configurazione calendario salvata.");
      router.refresh();
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      showToast("error", msg || "Salvataggio non riuscito.");
      return false;
    } finally {
      setLoading(false);
    }
  }

  function SelectorChips({ selectors, onRemove }: { selectors: string[]; onRemove?: (s: string) => void }) {
    if (!selectors.length) return null;
    return (
      <div className="d-flex flex-wrap gap-1 mt-2">
        {selectors.map((s) => (
          <span
            key={s}
            className="badge border d-inline-flex align-items-center gap-1"
            style={
              s.startsWith("ROLE:")
                ? { backgroundColor: "#f3f4f6", color: "#374151" }
                : { backgroundColor: `${selectorColor(s) ?? "#1f7a3f"}1f`, color: selectorColor(s) ?? "#1f7a3f" }
            }
          >
            {selectorLabel(s)}
            {onRemove ? (
              <button type="button" className="border-0 bg-transparent p-0" onClick={() => onRemove(s)}>
                ✕
              </button>
            ) : null}
          </span>
        ))}
      </div>
    );
  }

  function SelectorInput({
    query, setQuery, selected, setSelected,
  }: { query: string; setQuery: (v: string) => void; selected: string[]; setSelected: (fn: (prev: string[]) => string[]) => void }) {
    const filtered = selectorOptions.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 30);
    return (
      <div>
        <input
          className="form-control"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Scrivi per cercare…"
        />
        {query.trim() ? (
          <div className="border rounded-3 mt-1 bg-white" style={{ maxHeight: 220, overflowY: "auto", zIndex: 10, position: "relative" }}>
            {filtered.map((o) => (
              <button
                key={o.key}
                type="button"
                className="w-100 text-start bg-white border-0 py-2 px-2"
                style={{ borderBottom: "1px solid #eef2f3" }}
                onClick={() => {
                  setSelected((p) => (p.includes(o.key) ? p : [...p, o.key]));
                  setQuery("");
                }}
              >
                {o.label}
              </button>
            ))}
            {!filtered.length ? <div className="py-2 px-2 small text-secondary">Nessun risultato</div> : null}
          </div>
        ) : null}
        <SelectorChips selectors={selected} onRemove={(s) => setSelected((p) => p.filter((x) => x !== s))} />
      </div>
    );
  }

  return (
    <>
    <section className="card mt-3 border-success border-opacity-50">
      <div className="card-body">
        <h2 className="h5 fw-semibold mb-2">Vincoli persone/ruolo</h2>
        <p className="small text-secondary mb-0">
          Regole generali di co-presenza e esclusione, valide per tutti i periodi di questo calendario.
        </p>

        {rules.length === 0 ? (
          <div className="mt-3 d-flex justify-content-between align-items-center">
            <p className="small text-secondary mb-0">Non ci sono regole.</p>
            <button className="btn btn-success" type="button" onClick={() => openModal(null)} disabled={!canEdit || loading}>
              Aggiungi regola persona/ruolo
            </button>
          </div>
        ) : (
          <div className="d-grid gap-2 mt-3">
            {rules.map((r) => (
              <div key={r.id} className="border rounded-3 p-3 d-flex justify-content-between align-items-start gap-2 flex-wrap">
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div className="fw-semibold">{r.name}</div>
                  <div className="small text-secondary mt-1">{ruleDescription(r)}</div>
                </div>
                <div className="d-flex gap-2 flex-shrink-0">
                  <button type="button" className="btn btn-sm btn-outline-success" onClick={() => openModal(r.id)} disabled={loading}>
                    Modifica
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-danger"
                    onClick={() => setDeleteTargetId(r.id)}
                    disabled={!canEdit || loading}
                  >
                    Elimina
                  </button>
                </div>
              </div>
            ))}
            <div className="d-flex justify-content-end">
              <button className="btn btn-success" type="button" onClick={() => openModal(null)} disabled={!canEdit || loading}>
                Aggiungi regola persona/ruolo
              </button>
            </div>
          </div>
        )}
      </div>

      {modalOpen ? (
        <>
          <div className="modal fade show d-block" tabIndex={-1} role="dialog" aria-modal="true">
            <div className="modal-dialog modal-dialog-centered modal-xl">
              <div className="modal-content turny-modal">
                <div className="modal-header">
                  <h5 className="modal-title">{editingId ? "Modifica regola" : "Nuova regola"}</h5>
                  <button type="button" className="btn-close" aria-label="Chiudi" onClick={() => setModalOpen(false)} />
                </div>
                <div className="modal-body pb-4">
                  <div className="row g-3">
                    {/* Nome */}
                    <div className="col-12">
                      <label className="form-label small mb-1">Nome</label>
                      <input
                        className="form-control"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Es. Medico con tirocinante"
                      />
                    </div>

                    {/* Riga: Se — Relazione — Con */}
                    <div className="col-12 col-lg-5">
                      <label className="form-label small mb-1">Persona/ruolo</label>
                      <SelectorInput
                        query={ifQuery}
                        setQuery={setIfQuery}
                        selected={ifSelectors}
                        setSelected={setIfSelectors}
                      />
                    </div>

                    <div className="col-12 col-lg-2 d-flex flex-column justify-content-start">
                      <label className="form-label small mb-1">Relazione</label>
                      <select
                        className="form-select"
                        value={kind}
                        onChange={(e) => setKind(e.target.value === "NEVER_WITH" ? "NEVER_WITH" : "ALWAYS_WITH")}
                      >
                        <option value="ALWAYS_WITH">deve stare con</option>
                        <option value="NEVER_WITH">non deve stare con</option>
                      </select>
                    </div>

                    <div className="col-12 col-lg-5">
                      <label className="form-label small mb-1">Persona/ruolo</label>
                      <SelectorInput
                        query={thenQuery}
                        setQuery={setThenQuery}
                        selected={thenSelectors}
                        setSelected={setThenSelectors}
                      />
                    </div>
                  </div>
                </div>

                <div className="modal-footer d-flex justify-content-between">
                  <button type="button" className="btn btn-outline-secondary" onClick={() => setModalOpen(false)} disabled={loading}>
                    Annulla
                  </button>
                  <button
                    type="button"
                    className="btn btn-success"
                    disabled={loading || !canEdit || name.trim().length < 2 || ifSelectors.length === 0 || thenSelectors.length === 0}
                    onClick={() => {
                      const id = editingId ?? crypto.randomUUID();
                      const next: RuleDraft = { id, name: name.trim(), kind, ifSelectors, thenSelectors };
                      const nextRules = editingId ? rules.map((r) => (r.id === id ? next : r)) : [...rules, next];
                      void (async () => {
                        const ok = await persist(nextRules);
                        if (ok) setModalOpen(false);
                      })();
                    }}
                  >
                    Salva
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div
            role="presentation"
            onClick={() => setModalOpen(false)}
            style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.06)", zIndex: 1040 }}
          />
        </>
      ) : null}
    </section>

    {/* ── Regole giorno + flag smonto/riposo ────────────────── */}
    <section className="card mt-3 border-success border-opacity-50">
      <div className="card-body">
        <h2 className="h5 fw-semibold mb-1">Vincoli giorni</h2>
        <p className="small text-secondary mb-3">
          Collega i giorni della settimana: "se lavora il sabato, lavora/non lavora la domenica". Valido per tutti i membri del calendario.
        </p>

        {/* Flag smonto/riposo */}
        <div className="mb-3 d-flex align-items-center gap-3 border rounded p-3">
          <div className="flex-grow-1">
            <div className="fw-semibold small mb-1">Riposo dopo turno notturno</div>
            <div className="small text-secondary">Quanti giorni di riposo obbligatori dopo una notte?</div>
          </div>
          <select
            className="form-select form-select-sm"
            style={{ maxWidth: 180 }}
            value={restDaysAfterNight}
            onChange={(e) => {
              const v = Number(e.target.value);
              void persist(rules, dowRules, v);
            }}
            disabled={!canEdit || loading}
          >
            <option value={1}>1 giorno (smonto)</option>
            <option value={2}>2 giorni (smonto + riposo)</option>
          </select>
        </div>

        {/* Lista regole giorno */}
        {dowRules.length === 0 ? (
          <p className="small text-secondary mb-2">Non ci sono regole giorno.</p>
        ) : (
          <div className="d-flex flex-column gap-2 mb-3">
            {dowRules.map((r) => (
              <div key={r.id} className="border rounded p-2 d-flex justify-content-between align-items-start">
                <div>
                  <div className="fw-semibold small">{r.name}</div>
                  <div className="small text-secondary">
                    {DOW_LABELS[r.fromDow]} → {r.kind === "DAY_IMPLIES_DAY" ? "deve lavorare" : "non lavora"} → {DOW_LABELS[r.toDow]}
                  </div>
                </div>
                <div className="d-flex gap-2">
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    disabled={!canEdit || loading}
                    onClick={() => {
                      setDowEditingId(r.id);
                      setDowName(r.name);
                      setDowKind(r.kind);
                      setDowFromDow(r.fromDow);
                      setDowToDow(r.toDow);
                      setDowModalOpen(true);
                    }}
                  >
                    Modifica
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-danger"
                    disabled={!canEdit || loading}
                    onClick={() => setDeleteDowTargetId(r.id)}
                  >
                    Elimina
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="d-flex justify-content-end">
          <button
            type="button"
            className="btn btn-success btn-sm"
            disabled={!canEdit || loading}
            onClick={() => {
              setDowEditingId(null);
              setDowName("");
              setDowKind("DAY_IMPLIES_DAY");
              setDowFromDow(6);
              setDowToDow(0);
              setDowModalOpen(true);
            }}
          >
            Aggiungi regola giorno
          </button>
        </div>
      </div>
    </section>

    {/* Modal regola giorno */}
    {dowModalOpen ? (
      <>
        <div className="modal fade show d-block" tabIndex={-1} role="dialog" aria-modal="true" style={{ zIndex: 1050 }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content turny-modal">
              <div className="modal-header">
                <h5 className="modal-title">{dowEditingId ? "Modifica regola giorno" : "Nuova regola giorno"}</h5>
                <button type="button" className="btn-close" onClick={() => setDowModalOpen(false)} />
              </div>
              <div className="modal-body">
                <div className="mb-3">
                  <label className="form-label small mb-1">Nome</label>
                  <input className="form-control" value={dowName} onChange={(e) => setDowName(e.target.value)} placeholder="Es. Sabato implica domenica" />
                </div>
                <div className="row g-2 align-items-end">
                  <div className="col">
                    <label className="form-label small mb-1">Se lavora il</label>
                    <select className="form-select" value={dowFromDow} onChange={(e) => setDowFromDow(Number(e.target.value))}>
                      {DOW_LABELS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                    </select>
                  </div>
                  <div className="col-auto">
                    <select className="form-select" value={dowKind} onChange={(e) => setDowKind(e.target.value === "DAY_EXCLUDES_DAY" ? "DAY_EXCLUDES_DAY" : "DAY_IMPLIES_DAY")}>
                      <option value="DAY_IMPLIES_DAY">lavora anche</option>
                      <option value="DAY_EXCLUDES_DAY">non lavora</option>
                    </select>
                  </div>
                  <div className="col">
                    <label className="form-label small mb-1">il</label>
                    <select className="form-select" value={dowToDow} onChange={(e) => setDowToDow(Number(e.target.value))}>
                      {DOW_LABELS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                    </select>
                  </div>
                </div>
              </div>
              <div className="modal-footer d-flex justify-content-between">
                <button type="button" className="btn btn-outline-secondary" onClick={() => setDowModalOpen(false)} disabled={loading}>
                  Annulla
                </button>
                <button
                  type="button"
                  className="btn btn-success"
                  disabled={loading || !canEdit || dowName.trim().length < 2 || dowFromDow === dowToDow}
                  onClick={() => {
                    const id = dowEditingId ?? crypto.randomUUID();
                    const next: DowRuleDraft = { id, name: dowName.trim(), kind: dowKind, fromDow: dowFromDow, toDow: dowToDow };
                    const nextDows = dowEditingId ? dowRules.map((r) => (r.id === id ? next : r)) : [...dowRules, next];
                    void (async () => {
                      const ok = await persist(rules, nextDows);
                      if (ok) setDowModalOpen(false);
                    })();
                  }}
                >
                  Salva
                </button>
              </div>
            </div>
          </div>
        </div>
        <div role="presentation" onClick={() => setDowModalOpen(false)} style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.06)", zIndex: 1040 }} />
      </>
    ) : null}

    <ConfirmModal
      open={deleteDowTargetId !== null}
      title="Elimina regola giorno"
      message="Sei sicuro di voler eliminare questa regola?"
      confirmLabel="Elimina"
      confirmVariant="danger"
      loading={loading}
      onCancel={() => setDeleteDowTargetId(null)}
      onConfirm={() => {
        if (!deleteDowTargetId) return;
        const next = dowRules.filter((x) => x.id !== deleteDowTargetId);
        void (async () => {
          await persist(rules, next);
          setDeleteDowTargetId(null);
        })();
      }}
    />

    <ConfirmModal
      open={deleteTargetId !== null}
      title="Elimina regola"
      message="Sei sicuro di voler eliminare questa regola? L'operazione non è reversibile."
      confirmLabel="Elimina"
      confirmVariant="danger"
      loading={loading}
      onCancel={() => setDeleteTargetId(null)}
      onConfirm={() => {
        if (!deleteTargetId) return;
        const next = rules.filter((x) => x.id !== deleteTargetId);
        void (async () => {
          await persist(next);
          setDeleteTargetId(null);
        })();
      }}
    />
    <div className="d-flex justify-content-end mt-3">
      <button
        type="button"
        className="btn btn-success"
        disabled={!canEdit || loading}
        onClick={() => {
          void persist(rules, dowRules, restDaysAfterNight);
        }}
      >
        Salva
      </button>
    </div>
    </>
  );
}
