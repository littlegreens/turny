/**
 * Client per il microservizio OR-Tools (FastAPI). Nessun fallback al generatore Node.
 */

import type { SchedulerProblemPayload } from "@/lib/scheduler-problem";

export type RemoteAssignmentInput = {
  memberId: string;
  shiftTypeId: string;
  date: string;
};

export type SchedulerCalendarOutput = {
  schemaVersion: number;
  scheduleId: string;
  assignments: RemoteAssignmentInput[];
  solverStatus: string;
};

export type RemoteSolveOk = {
  kind: "ok";
  assignments: RemoteAssignmentInput[];
  alerts?: { type: string; message: string; date?: string; shiftTypeId?: string; memberId?: string }[];
  calendar?: SchedulerCalendarOutput;
};

export type RemoteSolveError = {
  kind: "error";
  status: string;
  message: string;
};

export type RemoteSolveResult = RemoteSolveOk | RemoteSolveError;

export async function callSchedulerSolve(scheduleId: string, problem: SchedulerProblemPayload): Promise<RemoteSolveResult> {
  const base = process.env.SCHEDULER_SERVICE_URL?.trim();
  if (!base) {
    return {
      kind: "error",
      status: "NO_SERVICE",
      message:
        "Servizio programmazione non configurato. Imposta SCHEDULER_SERVICE_URL in .env (es. http://localhost:8000) e avvia il servizio Python in turny-scheduler.",
    };
  }

  const url = `${base.replace(/\/$/, "")}/generate`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scheduleId, problem }),
      // Timeout rete verso uvicorn: evita che la route Next resti appesa per minuti se il servizio non risponde.
      signal: AbortSignal.timeout(88_000),
    });

    const raw = (await res.json()) as {
      status?: string;
      message?: string;
      calendar?: SchedulerCalendarOutput;
      assignments?: RemoteAssignmentInput[];
      alerts?: RemoteSolveOk["alerts"];
      error?: string;
    };

    if (!res.ok) {
      const msg = raw.message ?? raw.error ?? `HTTP ${res.status}`;
      return { kind: "error", status: raw.status ?? `HTTP_${res.status}`, message: msg };
    }

    const status = raw.status ?? "UNKNOWN";
    if (status !== "OPTIMAL" && status !== "FEASIBLE") {
      const impossible = status === "INFEASIBLE" || status === "MODEL_INVALID";
      return {
        kind: "error",
        status,
        message:
          raw.message ??
          (impossible
            ? "Nessuna assegnazione possibile rispetto ai vincoli (problema impossibile)."
            : "Il solver non ha prodotto una soluzione accettabile."),
      };
    }

    const assignments = Array.isArray(raw.assignments) ? raw.assignments : raw.calendar?.assignments;
    if (!Array.isArray(assignments)) {
      return {
        kind: "error",
        status: "BAD_RESPONSE",
        message: "Risposta solver non valida: mancano le assegnazioni.",
      };
    }

    return {
      kind: "ok",
      assignments,
      alerts: raw.alerts,
      calendar: raw.calendar,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { kind: "error", status: "NETWORK", message: msg };
  }
}
