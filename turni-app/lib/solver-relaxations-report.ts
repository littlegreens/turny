/** Avvisi del motore da mostrare nel report (compromessi / deroghe). */

export const SOLVER_RELAXATION_ALERT_TYPES = new Set([
  "DOW_RULE_RELAXED",
  "ALWAYS_WITH_RELAXED",
  "NEVER_WITH_RELAXED",
  "COVERAGE_SHORTFALL",
  "ROLE_COVERAGE_SHORTFALL",
  "ROLE_COVERAGE_BYPASSED",
  "RELAXATION_APPLIED",
  "CONTRACT_CAP_MONTH",
  "CONTRACT_CAP_NIGHTS",
  "CONTRACT_CAP_SAT",
  "CONTRACT_CAP_SUN",
  "CONTRACT_CAP_WEEKEND",
  "REQ_DATE_MISS",
  "REQ_SHIFT_MISS",
]);

/** Celle giorno×fascia e chip persona×data da evidenziare in rosso in base agli avvisi salvati. */
export function buildSolverRelaxationCellHighlights(alerts: unknown[]) {
  const slotKeys = new Set<string>();
  const memberContractIds = new Set<string>();
  const memberDateKeys = new Set<string>();
  const list = Array.isArray(alerts) ? alerts : [];
  for (const raw of list) {
    if (!raw || typeof raw !== "object") continue;
    const a = raw as Record<string, unknown>;
    const t = String(a.type ?? "");
    const date = typeof a.date === "string" ? a.date : null;
    const sid = typeof a.shiftTypeId === "string" ? a.shiftTypeId : null;
    const mid = typeof a.memberId === "string" ? a.memberId : null;

    if (
      (t === "COVERAGE_SHORTFALL" ||
        t === "ROLE_COVERAGE_SHORTFALL" ||
        t === "ROLE_COVERAGE_BYPASSED" ||
        t === "ALWAYS_WITH_RELAXED" ||
        t === "NEVER_WITH_RELAXED") &&
      date &&
      sid
    ) {
      slotKeys.add(`${date}|${sid}`);
    }

    if (
      t === "CONTRACT_CAP_MONTH" ||
      t === "CONTRACT_CAP_NIGHTS" ||
      t === "CONTRACT_CAP_SAT" ||
      t === "CONTRACT_CAP_SUN" ||
      t === "CONTRACT_CAP_WEEKEND"
    ) {
      // Segnale a livello persona (non per-chip): non possiamo sapere quale assegnazione è «di troppo»,
      // quindi evitiamo il ! su tutti i chip e usiamo solo il report sotto la griglia.
      // memberContractIds rimane per eventuali highlight a livello riga se aggiunto in futuro.
      if (mid) memberContractIds.add(mid);
    }

    if (t === "DOW_RULE_RELAXED") {
      const fd = typeof a.fromDate === "string" ? a.fromDate : null;
      const td = typeof a.toDate === "string" ? a.toDate : null;
      if (mid && fd) memberDateKeys.add(`${mid}|${fd}`);
      if (mid && td) memberDateKeys.add(`${mid}|${td}`);
    }

    if (t === "REQ_DATE_MISS" && mid && date) {
      memberDateKeys.add(`${mid}|${date}`);
    }
    if (t === "REQ_SHIFT_MISS" && mid && date) {
      memberDateKeys.add(`${mid}|${date}`);
      if (sid) slotKeys.add(`${date}|${sid}`);
    }
  }
  return { slotKeys, memberContractIds, memberDateKeys };
}

export function isSolverRelaxationAlert(a: unknown): a is Record<string, unknown> {
  if (!a || typeof a !== "object") return false;
  const t = (a as { type?: unknown }).type;
  return typeof t === "string" && SOLVER_RELAXATION_ALERT_TYPES.has(t);
}

/** Esclude messaggi tecnici di passata (RELAXATION_APPLIED) dal conteggio UI. */
export function hasUserVisibleSolverRelaxation(alerts: unknown): boolean {
  if (!Array.isArray(alerts)) return false;
  return alerts.some((raw) => {
    if (!isSolverRelaxationAlert(raw)) return false;
    const t = String((raw as { type?: unknown }).type);
    return t !== "RELAXATION_APPLIED";
  });
}

export function solverRelaxationShortTitle(type: string): string {
  switch (type) {
    case "DOW_RULE_RELAXED":
      return "Regola del calendario tra due giorni";
    case "ALWAYS_WITH_RELAXED":
      return "Co-presenza «devono stare insieme»";
    case "NEVER_WITH_RELAXED":
      return "Co-esclusione «non devono stare insieme»";
    case "COVERAGE_SHORTFALL":
      return "Copertura sotto il minimo organico";
    case "ROLE_COVERAGE_SHORTFALL":
      return "Composizione ruoli non rispettata";
    case "ROLE_COVERAGE_BYPASSED":
      return "Composizione ruoli (cella piena manuale)";
    case "RELAXATION_APPLIED":
      return "Passaggio automatico di sblocco vincoli";
    case "CONTRACT_CAP_MONTH":
      return "Superamento tetto turni mensili";
    case "CONTRACT_CAP_NIGHTS":
      return "Superamento tetto notti";
    case "CONTRACT_CAP_SAT":
      return "Superamento tetto sabati";
    case "CONTRACT_CAP_SUN":
      return "Superamento tetto domeniche";
    case "CONTRACT_CAP_WEEKEND":
      return "Superamento tetto giorni weekend";
    case "REQ_DATE_MISS":
      return "Obbligo «lavora questo giorno» non nel piano";
    case "REQ_SHIFT_MISS":
      return "Obbligo «questo turno» non nel piano";
    default:
      return "Altro avviso dal motore";
  }
}

export function formatIsoDateIt(iso: string): string {
  try {
    return new Intl.DateTimeFormat("it-IT").format(new Date(`${iso}T00:00:00.000Z`));
  } catch {
    return iso;
  }
}
