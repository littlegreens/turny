"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

type ToastKind = "success" | "error" | "info";
type ToastItem = {
  id: string;
  kind: ToastKind;
  message: string;
};

type ToastContextValue = {
  showToast: (kind: ToastKind, message: string, timeoutMs?: number) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const ICON_PATHS: Record<ToastKind, string> = {
  success:
    "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z",
  error:
    "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z",
  info: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z",
};

const BORDER_COLORS: Record<ToastKind, string> = {
  success: "#008758",
  error: "#d9364f",
  info: "#0073e6",
};

const ICON_COLORS: Record<ToastKind, string> = {
  success: "#008758",
  error: "#d9364f",
  info: "#0073e6",
};

const BG_COLORS: Record<ToastKind, string> = {
  success: "#f0faf5",
  error: "#fdf0f2",
  info: "#f0f6fc",
};

export function AppToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (kind: ToastKind, message: string, timeoutMs?: number) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setToasts((prev) => [...prev, { id, kind, message }]);
      const delay = timeoutMs ?? (kind === "error" ? 7000 : 3800);
      window.setTimeout(() => removeToast(id), delay);
    },
    [removeToast],
  );

  const ctx = useMemo<ToastContextValue>(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={ctx}>
      {children}
      <div
        className="position-fixed d-flex flex-column gap-2"
        style={{ top: 16, right: 16, zIndex: 2000, width: "min(92vw, 380px)" }}
        aria-live="polite"
        aria-atomic="false"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.kind === "error" ? "alert" : "status"}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.65rem",
              padding: "0.7rem 0.85rem",
              borderLeft: `4px solid ${BORDER_COLORS[t.kind]}`,
              background: BG_COLORS[t.kind],
              boxShadow: "0 2px 8px rgba(0,0,0,.1)",
              fontFamily: "var(--font-titillium), Arial, Helvetica, sans-serif",
              fontSize: "0.94rem",
              lineHeight: 1.35,
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              width="22"
              height="22"
              fill={ICON_COLORS[t.kind]}
              style={{ flexShrink: 0 }}
              aria-hidden="true"
            >
              <path d={ICON_PATHS[t.kind]} />
            </svg>
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useAppToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useAppToast must be used inside AppToastProvider");
  return ctx;
}

