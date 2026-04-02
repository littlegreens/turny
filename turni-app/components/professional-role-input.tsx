"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { parseProfessionalRoles, serializeProfessionalRoles } from "@/lib/professional-roles";

type Props = {
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  disabled?: boolean;
  id?: string;
  /** name HTML univoco: evita che il browser confonda il campo con username/password. */
  name?: string;
  placeholder?: string;
  className?: string;
  orgSlug?: string;
  canManageGlobalRoles?: boolean;
};

/**
 * Autocompletamento ruolo professionale: suggerimenti da ruoli già usati in org, senza duplicati per maiuscole/minuscole.
 */
export function ProfessionalRoleInput({
  value,
  onChange,
  suggestions,
  disabled,
  id,
  name = "org-professional-role",
  placeholder,
  className = "form-control form-control-sm input-underlined",
  orgSlug,
  canManageGlobalRoles = false,
}: Props) {
  const router = useRouter();
  const [manageOpen, setManageOpen] = useState(false);
  const [deleteTargetRole, setDeleteTargetRole] = useState<string | null>(null);
  const [deletingGlobalRole, setDeletingGlobalRole] = useState(false);
  const [editingGlobalRole, setEditingGlobalRole] = useState<string | null>(null);
  const [editingGlobalRoleDraft, setEditingGlobalRoleDraft] = useState("");
  const [savingGlobalRole, setSavingGlobalRole] = useState(false);
  const [open, setOpen] = useState(false);
  const roles = useMemo(() => parseProfessionalRoles(value), [value]);
  const [query, setQuery] = useState("");
  const normalizedSuggestions = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of suggestions) {
      for (const role of parseProfessionalRoles(s)) {
        const key = role.toLowerCase();
        if (!map.has(key)) map.set(key, role);
      }
    }
    return [...map.values()].sort((a, b) => a.localeCompare(b, "it", { sensitivity: "base" }));
  }, [suggestions]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return normalizedSuggestions.slice(0, 16);
    return normalizedSuggestions
      .filter((s) => {
        const sl = s.toLowerCase();
        return sl.startsWith(q) || sl.includes(q);
      })
      .slice(0, 16);
  }, [query, normalizedSuggestions]);

  function pushRole(roleRaw: string) {
    const role = roleRaw.trim();
    if (!role) return;
    const next = [...roles];
    if (!next.some((r) => r.toLowerCase() === role.toLowerCase())) next.push(role);
    onChange(serializeProfessionalRoles(next));
    setQuery("");
    setOpen(false);
  }

  function removeRole(role: string) {
    const next = roles.filter((r) => r.toLowerCase() !== role.toLowerCase());
    onChange(serializeProfessionalRoles(next));
  }

  function pick(canonical: string) {
    pushRole(canonical);
    setOpen(false);
  }

  async function deleteGlobalRole(role: string) {
    if (!orgSlug || !canManageGlobalRoles) return;
    setDeletingGlobalRole(true);
    try {
      const res = await fetch(`/api/orgs/${orgSlug}/professional-roles`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) return;
      removeRole(role);
      setDeleteTargetRole(null);
      router.refresh();
    } finally {
      setDeletingGlobalRole(false);
    }
  }

  async function renameGlobalRole() {
    if (!orgSlug || !canManageGlobalRoles || !editingGlobalRole || !editingGlobalRoleDraft.trim()) return;
    setSavingGlobalRole(true);
    try {
      const res = await fetch(`/api/orgs/${orgSlug}/professional-roles`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldRole: editingGlobalRole, newRole: editingGlobalRoleDraft.trim() }),
      });
      if (!res.ok) return;
      setEditingGlobalRole(null);
      setEditingGlobalRoleDraft("");
      router.refresh();
    } finally {
      setSavingGlobalRole(false);
    }
  }

  function handleBlur() {
    window.setTimeout(() => {
      setOpen(false);
    }, 150);
  }

  return (
    <div className="position-relative">
      <div className="d-flex flex-wrap gap-2 mb-2">
        {roles.map((r) => (
          <span key={r} className="d-inline-flex align-items-center gap-1 px-2 py-1 rounded-2" style={{ border: "1px solid #1f7a3f", background: "#edf7f0", color: "#1f7a3f", fontWeight: 600, fontSize: 12 }}>
            {r}
            <button
              type="button"
              className="border-0 bg-transparent d-inline-flex align-items-center justify-content-center"
              aria-label={`Rimuovi ruolo ${r}`}
              onClick={() => removeRole(r)}
              disabled={disabled}
              style={{ width: 18, height: 18, color: "#1f7a3f", borderRadius: "50%" }}
            >
              <span style={{ fontSize: 12, lineHeight: 1 }}>✕</span>
            </button>
          </span>
        ))}
      </div>
      <input
        id={id}
        name={name}
        type="text"
        className={className}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={handleBlur}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            pushRole(query);
          }
        }}
        disabled={disabled}
        placeholder={placeholder ?? "Scrivi ruolo e premi invio"}
        /* organization-title = ruolo/titolo lavorativo; riduce prompt “gestisci password” vicino a email/password */
        autoComplete="organization-title"
        data-1p-ignore
        data-lpignore="true"
        data-form-type="other"
        aria-autocomplete="list"
        aria-expanded={open}
      />
      {open && filtered.length > 0 && !disabled ? (
        <ul
          className="list-group position-absolute shadow-sm border rounded-2 mt-1 py-0"
          style={{ zIndex: 50, maxHeight: 220, overflowY: "auto", width: "100%", listStyle: "none" }}
          role="listbox"
        >
          {filtered.map((s) => (
            <li key={s}>
              <button
                type="button"
                className="list-group-item list-group-item-action py-2 px-3 small text-start w-100 border-0 rounded-0 bg-white"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(s)}
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <button type="button" className="btn btn-sm btn-outline-secondary mt-2" onClick={() => setManageOpen(true)} disabled={disabled}>
        Gestisci ruoli
      </button>
      {manageOpen ? (
        <>
          <div className="modal fade show d-block" tabIndex={-1} role="dialog" aria-modal="true" style={{ zIndex: 1050 }}>
            <div className="modal-dialog modal-dialog-centered turny-modal-medium">
              <div className="modal-content turny-modal">
                <div className="modal-header">
                  <h5 className="modal-title">Gestisci ruoli</h5>
                  <button type="button" className="btn-close" aria-label="Chiudi" onClick={() => setManageOpen(false)} />
                </div>
                <div className="modal-body pb-4">
                  <p className="fw-semibold mb-1">Ruoli generali creati</p>
                  <p className="small text-secondary mb-3">
                    Cancellando un ruolo verrà eliminato globalmente e tolto da tutte le persone.
                  </p>
                  <div className="d-grid gap-2">
                    {normalizedSuggestions.map((r) => (
                      <div key={r} className="border rounded d-flex align-items-center justify-content-between p-2 gap-2">
                        <div className="flex-grow-1">
                          {editingGlobalRole === r ? (
                            <input
                              className="form-control form-control-sm input-underlined"
                              value={editingGlobalRoleDraft}
                              onChange={(e) => setEditingGlobalRoleDraft(e.target.value)}
                              disabled={savingGlobalRole}
                              autoFocus
                            />
                          ) : (
                            <span>{r}</span>
                          )}
                        </div>
                        <div className="d-flex align-items-center gap-2">
                          {editingGlobalRole === r ? (
                            <>
                              <button type="button" className="btn btn-sm btn-success" onClick={() => void renameGlobalRole()} disabled={savingGlobalRole || !editingGlobalRoleDraft.trim() || !canManageGlobalRoles}>
                                Salva
                              </button>
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-secondary"
                                onClick={() => {
                                  setEditingGlobalRole(null);
                                  setEditingGlobalRoleDraft("");
                                }}
                                disabled={savingGlobalRole}
                              >
                                Annulla
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-secondary"
                                onClick={() => {
                                  setEditingGlobalRole(r);
                                  setEditingGlobalRoleDraft(r);
                                }}
                                disabled={!canManageGlobalRoles}
                              >
                                Modifica
                              </button>
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-danger"
                                onClick={() => setDeleteTargetRole(r)}
                                disabled={disabled || !canManageGlobalRoles}
                              >
                                Elimina
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                    {!normalizedSuggestions.length ? <span className="small text-secondary">Nessun ruolo globale definito.</span> : null}
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-outline-secondary" onClick={() => setManageOpen(false)}>
                    Chiudi
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div role="presentation" onClick={() => setManageOpen(false)} style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.06)", zIndex: 1040 }} />
        </>
      ) : null}
      {deleteTargetRole ? (
        <>
          <div className="modal fade show d-block" tabIndex={-1} role="dialog" aria-modal="true" style={{ zIndex: 1060 }}>
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content turny-modal">
                <div className="modal-header">
                  <h5 className="modal-title">Elimina ruolo globale</h5>
                  <button type="button" className="btn-close" aria-label="Chiudi" onClick={() => setDeleteTargetRole(null)} />
                </div>
                <div className="modal-body pb-3">
                  <p className="mb-0">
                    Confermi l&apos;eliminazione del ruolo <strong>{deleteTargetRole}</strong>? Verrà cancellato per tutte le persone.
                  </p>
                </div>
                <div className="modal-footer d-flex justify-content-between">
                  <button type="button" className="btn btn-outline-secondary" onClick={() => setDeleteTargetRole(null)} disabled={deletingGlobalRole}>
                    Annulla
                  </button>
                  <button type="button" className="btn btn-danger" onClick={() => void deleteGlobalRole(deleteTargetRole)} disabled={deletingGlobalRole || !canManageGlobalRoles}>
                    {deletingGlobalRole ? "Eliminazione..." : "Elimina"}
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div role="presentation" onClick={() => setDeleteTargetRole(null)} style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.06)", zIndex: 1055 }} />
        </>
      ) : null}
    </div>
  );
}
