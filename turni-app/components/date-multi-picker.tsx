"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Props = {
  selectedDates: string[];
  onChange: (dates: string[]) => void;
  /** Se fornito, solo i giorni in questo array sono selezionabili. */
  allowedDates?: string[];
  /** Testo del trigger (default: "Seleziona giorni"). */
  triggerLabel?: string;
};

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fromIsoDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function formatDateIt(iso: string) {
  return new Intl.DateTimeFormat("it-IT").format(new Date(`${iso}T00:00:00.000Z`));
}

const monthFmt = new Intl.DateTimeFormat("it-IT", { month: "long", year: "numeric" });
const WEEKDAYS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

export function DateMultiPicker({ selectedDates, onChange, allowedDates, triggerLabel }: Props) {
  const allowedSet = useMemo(() => (allowedDates?.length ? new Set(allowedDates) : null), [allowedDates]);

  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState<Date>(() => {
    // Primo: usa il primo giorno già selezionato
    if (selectedDates[0]) return fromIsoDate(selectedDates[0]);
    // Secondo: usa il primo giorno permesso (es. inizio periodo turno)
    if (allowedDates?.[0]) return fromIsoDate(allowedDates[0]);
    return new Date();
  });

  const containerRef = useRef<HTMLDivElement>(null);

  // Chiudi cliccando fuori
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Quando cambiano le date permesse (nuovo modal), aggiorna il mese vista
  useEffect(() => {
    if (selectedDates[0]) {
      setViewMonth(fromIsoDate(selectedDates[0]));
    } else if (allowedDates?.[0]) {
      setViewMonth(fromIsoDate(allowedDates[0]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowedDates?.[0]]);

  const cells = useMemo(() => {
    const y = viewMonth.getFullYear();
    const m = viewMonth.getMonth();
    const first = new Date(y, m, 1);
    const last = new Date(y, m + 1, 0);
    const total = last.getDate();
    const startOffset = (first.getDay() + 6) % 7;
    const out: Array<{ iso: string; day: number; inMonth: boolean; disabled: boolean }> = [];
    for (let i = 0; i < startOffset; i++) {
      const d = new Date(y, m, -startOffset + i + 1);
      out.push({ iso: toIsoDate(d), day: d.getDate(), inMonth: false, disabled: true });
    }
    for (let day = 1; day <= total; day++) {
      const d = new Date(y, m, day);
      const iso = toIsoDate(d);
      out.push({ iso, day, inMonth: true, disabled: allowedSet ? !allowedSet.has(iso) : false });
    }
    while (out.length % 7 !== 0) {
      const d = new Date(y, m, total + (out.length % 7) + 1);
      out.push({ iso: toIsoDate(d), day: d.getDate(), inMonth: false, disabled: true });
    }
    return out;
  }, [viewMonth, allowedSet]);

  return (
    <div ref={containerRef} style={{ position: "relative", display: "inline-block" }}>
      {/* Trigger */}
      <button
        type="button"
        className="btn btn-outline-success btn-sm"
        onClick={() => setOpen((v) => !v)}
      >
        {triggerLabel ?? "Seleziona giorni"}
      </button>

      {/* Dropdown popup */}
      {open ? (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            zIndex: 2000,
            background: "#fff",
            border: "1px solid #c7d3cc",
            borderRadius: "0.65rem",
            boxShadow: "0 8px 24px rgba(16,24,40,0.13)",
            padding: "0.75rem",
            minWidth: 280,
          }}
        >
          {/* Navigazione mese */}
          <div className="d-flex justify-content-between align-items-center mb-2">
            <button
              type="button"
              className="btn btn-sm btn-outline-success"
              onClick={() => setViewMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
            >
              ‹
            </button>
            <strong className="text-capitalize small">{monthFmt.format(viewMonth)}</strong>
            <button
              type="button"
              className="btn btn-sm btn-outline-success"
              onClick={() => setViewMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
            >
              ›
            </button>
          </div>

          {/* Griglia giorni */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
              gap: 4,
            }}
          >
            {WEEKDAYS.map((w) => (
              <div key={w} className="text-center text-secondary" style={{ fontSize: 11, fontWeight: 600, padding: "2px 0" }}>
                {w}
              </div>
            ))}
            {cells.map((c) => {
              const active = selectedDates.includes(c.iso);
              return (
                <button
                  key={c.iso}
                  type="button"
                  disabled={c.disabled}
                  className={`btn btn-sm ${active ? "btn-success" : c.inMonth ? "btn-outline-success" : "btn-light"}`}
                  style={{ opacity: c.inMonth ? 1 : 0.4, padding: "3px 2px", fontSize: 13 }}
                  onClick={() => {
                    if (c.disabled) return;
                    const next = new Set(selectedDates);
                    if (next.has(c.iso)) next.delete(c.iso);
                    else next.add(c.iso);
                    onChange([...next].sort());
                  }}
                >
                  {c.day}
                </button>
              );
            })}
          </div>

          {/* Footer */}
          <div className="d-flex justify-content-between align-items-center mt-2 pt-2 border-top">
            <span className="small text-secondary">{selectedDates.length ? `${selectedDates.length} giorni` : "Nessuno"}</span>
            <div className="d-flex gap-2">
              {selectedDates.length > 0 ? (
                <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => onChange([])}>
                  Reset
                </button>
              ) : null}
              <button type="button" className="btn btn-sm btn-success" onClick={() => setOpen(false)}>
                OK
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Pill dei giorni selezionati (sotto il trigger) */}
      {selectedDates.length > 0 ? (
        <div className="d-flex flex-wrap gap-1 mt-2">
          {selectedDates.map((d) => (
            <span key={d} className="badge text-bg-light border d-inline-flex align-items-center gap-1" style={{ fontSize: 12 }}>
              {formatDateIt(d)}
              <button
                type="button"
                className="border-0 bg-transparent p-0"
                style={{ lineHeight: 1, fontSize: 11 }}
                onClick={() => onChange(selectedDates.filter((x) => x !== d))}
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
