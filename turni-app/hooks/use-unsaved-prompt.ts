"use client";

import { useEffect } from "react";

/**
 * Avviso browser in chiusura tab/refresh se ci sono modifiche non salvate.
 * La navigazione interna Next.js non è intercettabile senza wrapper sui Link;
 * per i modal usare una conferma dedicata alla chiusura.
 */
export function useBeforeUnloadWhen(active: boolean, _message?: string) {
  useEffect(() => {
    if (!active) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [active]);
}
