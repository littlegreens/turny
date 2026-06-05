"use client";

import { useEffect, useRef, useState } from "react";
import { HexColorPicker } from "react-colorful";

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

export const PERSON_PALETTE_COLORS = [
  "#FFFFFF",
  "#F8FAFC",
  "#FEE2E2",
  "#FECACA",
  "#FCA5A5",
  "#FEF3C7",
  "#FDE68A",
  "#FCD34D",
  "#D9F99D",
  "#BBF7D0",
  "#86EFAC",
  "#4ADE80",
  "#A7F3D0",
  "#6EE7B7",
  "#99F6E4",
  "#5EEAD4",
  "#BAE6FD",
  "#7DD3FC",
  "#93C5FD",
  "#60A5FA",
  "#BFDBFE",
  "#C7D2FE",
  "#A5B4FC",
  "#DDD6FE",
  "#C4B5FD",
  "#E9D5FF",
  "#F5D0FE",
  "#FBCFE8",
  "#FDA4AF",
  "#FECDD3",
  "#E2E8F0",
  "#CBD5E1",
  "#1F7A3F",
  "#3B8BD4",
  "#E57373",
  "#7E57C2",
  "#26A69A",
  "#F97316",
  "#EF4444",
  "#EC4899",
  "#8B5CF6",
  "#334155",
];

function normalizeHex(raw: string): string | null {
  const t = raw.trim().replace(/^#/, "");
  if (/^[0-9A-Fa-f]{6}$/.test(t)) return `#${t.toUpperCase()}`;
  if (/^[0-9A-Fa-f]{3}$/.test(t)) {
    const [r, g, b] = t.split("");
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  return null;
}

function InheritSwatchPreview({ className }: { className?: string }) {
  return (
    <span
      className={className}
      style={{
        display: "inline-block",
        boxSizing: "border-box",
        width: 22,
        height: 22,
        borderRadius: "50%",
        backgroundColor: "#fff",
        border: "1px solid #94a3b8",
        backgroundImage: "linear-gradient(135deg, transparent 44%, #94a3b8 44%, #94a3b8 56%, transparent 56%)",
        flexShrink: 0,
      }}
      title="Default organizzazione"
    />
  );
}

export function ColorPalettePicker({
  value,
  onChange,
  colors = PERSON_PALETTE_COLORS,
  disabled = false,
  label = "Colore",
  inheritOption = false,
  inheritSelected = false,
  onSelectInherit,
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const pickerHex = inheritSelected ? "#FFFFFF" : normalizeHex(value) ?? "#FFFFFF";
  const [draftHex, setDraftHex] = useState(pickerHex);
  const [hexInput, setHexInput] = useState(pickerHex.replace("#", ""));

  useEffect(() => {
    const h = inheritSelected ? "#FFFFFF" : normalizeHex(value) ?? "#FFFFFF";
    setDraftHex(h);
    setHexInput(h.replace("#", ""));
  }, [value, inheritSelected]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  function applyHex(hex: string) {
    const n = normalizeHex(hex);
    if (!n) return;
    setDraftHex(n);
    setHexInput(n.replace("#", ""));
    onChange(n);
  }

  const displayHex = inheritSelected ? "default" : (normalizeHex(value) ?? value).toUpperCase();
  const previewBg = inheritSelected ? "#fff" : normalizeHex(value) ?? "#FFFFFF";

  return (
    <div className="position-relative" ref={rootRef}>
      {label ? <label className="form-label small mb-1 d-block">{label}</label> : null}
      <button
        type="button"
        className="color-picker-trigger-v2"
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        {inheritSelected ? (
          <InheritSwatchPreview />
        ) : (
          <span
            className="color-picker-preview-v2"
            style={{
              backgroundColor: previewBg,
              border: previewBg.toUpperCase() === "#FFFFFF" ? "1px solid #cbd5e1" : "1px solid rgba(0,0,0,0.12)",
            }}
          />
        )}
        <span className="small fw-semibold text-secondary">{displayHex}</span>
      </button>

      {open ? (
        <div className="color-picker-popover-v2" role="dialog" aria-label="Scegli colore">
          <HexColorPicker
            color={draftHex}
            onChange={(hex) => {
              setDraftHex(hex.toUpperCase());
              setHexInput(hex.replace("#", "").toUpperCase());
              onChange(hex.toUpperCase());
            }}
            className="color-picker-canvas"
          />

          <div className="color-picker-hex-row mt-2">
            <span className="color-picker-hex-prefix">#</span>
            <input
              type="text"
              className="form-control form-control-sm color-picker-hex-input"
              maxLength={6}
              value={hexInput}
              onChange={(e) => {
                const raw = e.target.value.replace(/[^0-9A-Fa-f]/g, "").slice(0, 6);
                setHexInput(raw.toUpperCase());
                if (raw.length === 6) applyHex(`#${raw}`);
              }}
              onBlur={() => {
                const n = normalizeHex(hexInput);
                if (n) applyHex(n);
                else setHexInput(draftHex.replace("#", ""));
              }}
              aria-label="Codice esadecimale colore"
            />
          </div>

          <p className="color-picker-section-label mb-1 mt-3">Colori rapidi</p>
          <div className="color-picker-grid">
            {inheritOption && onSelectInherit ? (
              <button
                type="button"
                className={`color-picker-grid-swatch ${inheritSelected ? "active" : ""}`}
                onClick={() => {
                  onSelectInherit();
                  setOpen(false);
                }}
                aria-label="Usa colore default organizzazione"
                title="Default org."
              >
                <InheritSwatchPreview className="m-0" />
              </button>
            ) : null}
            {colors.map((color) => {
              const active = !inheritSelected && color.toUpperCase() === (normalizeHex(value) ?? "").toUpperCase();
              const isWhite = color.toUpperCase() === "#FFFFFF";
              return (
                <button
                  key={color}
                  type="button"
                  className={`color-picker-grid-swatch ${active ? "active" : ""}`}
                  style={{
                    backgroundColor: color,
                    border: isWhite ? "1px solid #cbd5e1" : "1px solid rgba(0,0,0,0.08)",
                  }}
                  onClick={() => {
                    applyHex(color);
                    setOpen(false);
                  }}
                  aria-label={`Colore ${color}`}
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
