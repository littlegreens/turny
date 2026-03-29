"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  value: string;
  onChange: (value: string) => void;
  colors?: string[];
  disabled?: boolean;
  label?: string;
  /** Mostra cerchio bianco con barra: colore non impostato sul calendario (vale impostazioni membro). */
  inheritOption?: boolean;
  inheritSelected?: boolean;
  onSelectInherit?: () => void;
};

const defaultColors = [
  "#1F7A3F",
  "#3B8BD4",
  "#E1F5EE",
  "#F9D56E",
  "#E57373",
  "#7E57C2",
  "#26A69A",
  "#607D8B",
  "#0EA5E9",
  "#22C55E",
  "#F97316",
  "#EAB308",
  "#EF4444",
  "#EC4899",
  "#8B5CF6",
  "#14B8A6",
  "#334155",
  "#4ADE80",
  "#FB7185",
  "#A3E635",
];

function InheritSwatchPreview({ className }: { className?: string }) {
  return (
    <span
      className={className}
      style={{
        display: "inline-block",
        boxSizing: "border-box",
        width: 18,
        height: 18,
        borderRadius: "50%",
        backgroundColor: "#fff",
        border: "1px solid #8ea196",
        backgroundImage: "linear-gradient(135deg, transparent 44%, #94a3b8 44%, #94a3b8 56%, transparent 56%)",
        flexShrink: 0,
      }}
      title="Non impostato"
    />
  );
}

export function ColorPalettePicker({
  value,
  onChange,
  colors = defaultColors,
  disabled = false,
  label = "Colore",
  inheritOption = false,
  inheritSelected = false,
  onSelectInherit,
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  return (
    <div className="position-relative" ref={rootRef}>
      <label className="form-label small mb-1 d-block">{label}</label>
      <button
        type="button"
        className="color-picker-trigger"
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        {inheritSelected ? (
          <InheritSwatchPreview className="color-picker-preview" />
        ) : (
          <span className="color-picker-preview" style={{ backgroundColor: value }} />
        )}
        <span className={`small fw-semibold ${inheritSelected ? "text-body" : "text-secondary"}`}>
          {inheritSelected ? "default" : value.toUpperCase()}
        </span>
      </button>

      {open ? (
        <div className="color-picker-popover" role="dialog" aria-label="Scegli colore">
          <div className="d-flex flex-wrap gap-1 align-items-center">
            {inheritOption && onSelectInherit ? (
              <button
                type="button"
                onClick={() => {
                  onSelectInherit();
                  setOpen(false);
                }}
                className="color-swatch"
                style={{
                  padding: 0,
                  border: "2px solid #cbd5e1",
                  background: "#fff",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 28,
                  height: 28,
                  borderRadius: 6,
                }}
                aria-label="Colore default (scheda membro organizzazione)"
                title="default"
              >
                <InheritSwatchPreview />
              </button>
            ) : null}
            {colors.map((color) => {
              const active = !inheritSelected && color.toLowerCase() === value.toLowerCase();
              return (
                <button
                  key={color}
                  type="button"
                  onClick={() => {
                    onChange(color);
                    setOpen(false);
                  }}
                  className={`color-swatch ${active ? "active" : ""}`}
                  style={{ backgroundColor: color }}
                  aria-label={`Seleziona colore ${color}`}
                  title={color}
                />
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
