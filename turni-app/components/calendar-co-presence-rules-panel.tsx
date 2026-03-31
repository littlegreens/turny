"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppToast } from "@/components/app-toast-provider";

type MemberOpt = { id: string; label: string; professionalRole: string };

type RuleDraft = {
  id: string;
  name: string;
  kind: "ALWAYS_WITH" | "NEVER_WITH";
  ifSelectors: string[];
  thenSelectors: string[];
};

type Props = {
  calId: string;
  canEdit: boolean;
  initialCalendarRules: unknown;
  members: MemberOpt[];
};

export function CalendarCoPresenceRulesPanel({ calId, canEdit, initialCalendarRules, members }: Props) {
  const router = useRouter();
  const { showToast } = useAppToast();
  const initial = (initialCalendarRules ?? {}) as { coPresenceRules?: unknown };
  const [rules, setRules] = useState<RuleDraft[]>(() => {
    const list = Array.isArray(initial.coPresenceRules) ? initial.coPresenceRules : [];
    return list
      .filter((r): r is Record<string, unknown> => Boolean(r && typeof r === "object"))
      .map((r) => ({
        id: String(r.id || crypto.randomUUID()),
        name: String(r.name || "Regola"),
        kind: r.kind === "NEVER_WITH" ? ("NEVER_WITH" as const) : ("ALWAYS_WITH" as const),
        ifSelectors: Array.isArray(r.ifSelectors)
          ? r.ifSelectors.map(String).filter(Boolean)
          : Array.isArray(r.ifMemberIds)
            ? r.ifMemberIds.map((id) => `MEMBER:${String(id)}`).filter(Boolean)
            : [],
        thenSelectors: Array.isArray(r.thenSelectors)
          ? r.thenSelectors.map(String).filter(Boolean)
          : Array.isArray(r.thenMemberIds)
            ? r.thenMemberIds.map((id) => `MEMBER:${String(id)}`).filter(Boolean)
            : [],
      }))
      .filter((r) => r.ifSelectors.length && r.thenSelectors.length);
  });

  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"ALWAYS_WITH" | "NEVER_WITH">("ALWAYS_WITH");
  const [ifSelectors, setIfSelectors] = useState<string[]>([]);
  const [thenSelectors, setThenSelectors] = useState<string[]>([]);
  const [ifQuery, setIfQuery] = useState("");
  const [thenQuery, setThenQuery] = useState("");

  const roleOptions = useMemo(() => {
    const set = new Set<string>();
    for (const m of members) {
      const r = String(m.professionalRole ?? "").trim();
      if (r) set.add(r);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [members]);

  const selectorOptions = useMemo(() => {
    const out: Array<{ key: string; label: string }> = [];
    for (const r of roleOptions) out.push({ key: `ROLE:${r}`, label: `Ruolo: ${r}` });
    for (const m of members) out.push({ key: `MEMBER:${m.id}`, label: m.label });
    return out;
  }, [members, roleOptions]);

  function selectorLabel(sel: string): string {
    if (sel.startsWith("ROLE:")) return `Ruolo: ${sel.slice("ROLE:".length)}`;
    if (sel.startsWith("MEMBER:")) {
      const id = sel.slice("MEMBER:".length);
      return members.find((m) => m.id === id)?.label ?? `Persona: ${id}`;
    }
    return sel;
  }

  function open(ruleId: string | null) {
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

  async function persist(nextRules: RuleDraft[]) {
    setLoading(true);
    try {
      const base = (initialCalendarRules ?? {}) as Record<string, unknown>;
      const next = {
        ...base,
        coPresenceRules: nextRules.map((r) => ({
          id: r.id,
          name: r.name.trim(),
          kind: r.kind,
          ifSelectors: [...new Set(r.ifSelectors)].filter(Boolean),
          thenSelectors: [...new Set(r.thenSelectors)].filter(Boolean),
        })),
      };
      const res = await fetch(`/api/calendars/${calId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rules: next }),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        showToast("error", payload.error ?? "Salvataggio non riuscito");
        return false;
      }
      setRules(nextRules);
      router.refresh();
      return true;
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="card mt-3 border-success border-opacity-50">
      <div className="card-body">
        <div className="d-flex justify-content-between align-items-start gap-2 flex-wrap">
          <div>
            <h2 className="h5 fw-semibold mb-2">Regole calendario</h2>
            <p className="small text-secondary mb-0">
              Regole HARD generali: co-presenza (“deve stare con”) ed esclusione (“non deve stare con”) nello stesso slot (giorno×turno).
            </p>
          </div>
          <button className="btn btn-success" type="button" onClick={() => open(null)} disabled={!canEdit || loading}>
            Aggiungi regola
          </button>
        </div>

        {rules.length === 0 ? (
          <p className="small text-secondary mt-3 mb-0">Non ci sono regole.</p>
        ) : (
          <div className="d-grid gap-2 mt-3">
            {rules.map((r) => (
              <div key={r.id} className="border rounded-3 p-3 d-flex justify-content-between align-items-start gap-3 flex-wrap">
                <div style={{ minWidth: 260, flex: 1 }}>
                  <div className="fw-semibold">{r.name}</div>
                  <div className="small text-secondary">{r.kind === "ALWAYS_WITH" ? "Deve stare con" : "Non deve stare con"}</div>
                </div>
                <div className="d-flex gap-2">
                  <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => open(r.id)} disabled={loading}>
                    Modifica
                  </button>
                  <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => void persist(rules.filter((x) => x.id !== r.id))} disabled={!canEdit || loading}>
                    Elimina
                  </button>
                </div>
              </div>
            ))}
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
                    <div className="col-12">
                      <label className="form-label small mb-1">Nome</label>
                      <input className="form-control" value={name} onChange={(e) => setName(e.target.value)} />
                    </div>
                    <div className="col-12 col-lg-4">
                      <label className="form-label small mb-1">Tipo</label>
                      <select className="form-select" value={kind} onChange={(e) => setKind(e.target.value === "NEVER_WITH" ? "NEVER_WITH" : "ALWAYS_WITH")}>
                        <option value="ALWAYS_WITH">Deve stare con</option>
                        <option value="NEVER_WITH">Non deve stare con</option>
                      </select>
                    </div>
                    <div className="col-12 col-lg-6">
                      <label className="form-label small mb-1">Se (persona/ruolo)</label>
                      <input className="form-control" value={ifQuery} onChange={(e) => setIfQuery(e.target.value)} placeholder="Scrivi per cercare…" />
                      {ifQuery.trim() ? (
                        <div className="border rounded-3 mt-2 bg-white" style={{ maxHeight: 220, overflowY: "auto" }}>
                          {selectorOptions
                            .filter((o) => o.label.toLowerCase().includes(ifQuery.trim().toLowerCase()))
                            .slice(0, 30)
                            .map((o) => (
                              <button
                                key={`ifopt-${o.key}`}
                                type="button"
                                className="w-100 text-start btn btn-sm btn-light border-0 rounded-0"
                                onClick={() => {
                                  setIfSelectors((prev) => (prev.includes(o.key) ? prev : [...prev, o.key]));
                                  setIfQuery("");
                                }}
                              >
                                {o.label}
                              </button>
                            ))}
                        </div>
                      ) : null}
                      {ifSelectors.length ? (
                        <div className="d-flex flex-wrap gap-1 mt-2">
                          {ifSelectors.map((s) => (
                            <span key={`ifsel-${s}`} className="badge text-bg-light border">
                              {selectorLabel(s)}{" "}
                              <button type="button" className="border-0 bg-transparent" onClick={() => setIfSelectors((p) => p.filter((x) => x !== s))}>
                                ✕
                              </button>
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <div className="col-12 col-lg-6">
                      <label className="form-label small mb-1">Con (persona/ruolo)</label>
                      <input className="form-control" value={thenQuery} onChange={(e) => setThenQuery(e.target.value)} placeholder="Scrivi per cercare…" />
                      {thenQuery.trim() ? (
                        <div className="border rounded-3 mt-2 bg-white" style={{ maxHeight: 220, overflowY: "auto" }}>
                          {selectorOptions
                            .filter((o) => o.label.toLowerCase().includes(thenQuery.trim().toLowerCase()))
                            .slice(0, 30)
                            .map((o) => (
                              <button
                                key={`thenopt-${o.key}`}
                                type="button"
                                className="w-100 text-start btn btn-sm btn-light border-0 rounded-0"
                                onClick={() => {
                                  setThenSelectors((prev) => (prev.includes(o.key) ? prev : [...prev, o.key]));
                                  setThenQuery("");
                                }}
                              >
                                {o.label}
                              </button>
                            ))}
                        </div>
                      ) : null}
                      {thenSelectors.length ? (
                        <div className="d-flex flex-wrap gap-1 mt-2">
                          {thenSelectors.map((s) => (
                            <span key={`thensel-${s}`} className="badge text-bg-light border">
                              {selectorLabel(s)}{" "}
                              <button type="button" className="border-0 bg-transparent" onClick={() => setThenSelectors((p) => p.filter((x) => x !== s))}>
                                ✕
                              </button>
                            </span>
                          ))}
                        </div>
                      ) : null}
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
          <div role="presentation" onClick={() => setModalOpen(false)} style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.06)", zIndex: 1040 }} />
        </>
      ) : null}
    </section>
  );
}

