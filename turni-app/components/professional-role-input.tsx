"use client";

import { useMemo, useState } from "react";

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
}: Props) {
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return suggestions.slice(0, 16);
    return suggestions
      .filter((s) => {
        const sl = s.toLowerCase();
        return sl.startsWith(q) || sl.includes(q);
      })
      .slice(0, 16);
  }, [value, suggestions]);

  function pick(canonical: string) {
    onChange(canonical);
    setOpen(false);
  }

  function handleBlur() {
    window.setTimeout(() => {
      setOpen(false);
      const t = value.trim();
      if (!t) return;
      const match = suggestions.find((s) => s.toLowerCase() === t.toLowerCase());
      if (match) onChange(match);
    }, 150);
  }

  return (
    <div className="position-relative">
      <input
        id={id}
        name={name}
        type="text"
        className={className}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={handleBlur}
        disabled={disabled}
        placeholder={placeholder}
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
    </div>
  );
}
