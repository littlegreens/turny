/**
 * Euristiche leggibili quando CP-SAT restituisce INFEASIBLE (nessun dettaglio dal solver).
 */

export type InfeasibilityHints = {
  stats: {
    /** Slot ancora da coprire (min staff − già assegnato per cella attiva). */
    slotsToCover: number;
    assignmentsAlreadyFixed: number;
    teamMembers: number;
    jollyCount: number;
    /** Somma dei massimali turni/mese; null se almeno uno è illimitato. */
    sumContractMaxShifts: number | null;
    /** Massimo minStaff tra i tipi turno (serve confronto con |team|). */
    maxMinStaffOnSingleSlot: number;
    /** Vincoli mensili non disponibile (giorno o turno) su questo piano. */
    monthlyUnavailable: number;
    /** Obblighi DEVE (giorno o turno) su questo piano. */
    monthlyRequired: number;
    /** Regole co-presenza / esclusione (calendario + turno) nel payload. */
    coPresenceRules: number;
  };
  suggestions: Array<{ id: string; title: string; body: string }>;
};

function memberLabel(first: string | null, last: string | null, email: string | null): string {
  const n = `${first ?? ""} ${last ?? ""}`.trim();
  return n || email || "—";
}

function utcDow(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00.000Z`).getUTCDay();
}

export function buildInfeasibilityHints(input: {
  dates: string[];
  shiftTypes: Array<{ id: string; name: string; minStaff: number; activeWeekdays: number[] }>;
  members: Array<{
    id: string;
    isJolly: boolean;
    contractShiftsMonth: number | null;
    user: { firstName: string | null; lastName: string | null; email: string | null };
  }>;
  fixedAssignments: Array<{ date: string; shiftTypeId: string }>;
  monthlyConstraintsCount: number;
  /** Dettaglio vincoli mensili (opzionale, default 0). */
  monthlyUnavailable?: number;
  monthlyRequired?: number;
  coPresenceRules?: number;
}): InfeasibilityHints {
  const monthlyUnavailable = input.monthlyUnavailable ?? 0;
  const monthlyRequired = input.monthlyRequired ?? 0;
  const coPresenceRules = input.coPresenceRules ?? 0;
  const fixedByCell = new Map<string, number>();
  for (const a of input.fixedAssignments) {
    const k = `${a.date}|${a.shiftTypeId}`;
    fixedByCell.set(k, (fixedByCell.get(k) ?? 0) + 1);
  }

  let slotsToCover = 0;
  let maxMinStaffOnSingleSlot = 0;
  for (const st of input.shiftTypes) {
    if (st.minStaff > maxMinStaffOnSingleSlot) maxMinStaffOnSingleSlot = st.minStaff;
  }

  for (const dateStr of input.dates) {
    const dow = utcDow(dateStr);
    for (const st of input.shiftTypes) {
      if (!st.activeWeekdays.includes(dow)) continue;
      const k = `${dateStr}|${st.id}`;
      const have = fixedByCell.get(k) ?? 0;
      slotsToCover += Math.max(0, st.minStaff - have);
    }
  }

  const teamMembers = input.members.length;
  const jollyCount = input.members.filter((m) => m.isJolly).length;
  let sumContractMaxShifts: number | null = 0;
  for (const m of input.members) {
    if (m.contractShiftsMonth == null) {
      sumContractMaxShifts = null;
      break;
    }
    sumContractMaxShifts += m.contractShiftsMonth;
  }

  const suggestions: InfeasibilityHints["suggestions"] = [];

  suggestions.push({
    id: "where-grid",
    title: "Dove toccare indisponibilità e obblighi",
    body:
      "Sulla **griglia di questo turno**, clicca il **nome** di una persona: si apre la scheda con i pulsanti verde/rosso per ogni giorno e fascia. " +
      "Quelle impostazioni valgono **solo per questo periodo**. Salva con «Salva» in fondo alla scheda. " +
      "Per i vincoli generali (es. mai il lunedì) usa la scheda persona sull’organizzazione.",
  });

  if (monthlyRequired > 0) {
    suggestions.push({
      id: "required-constraints",
      title: "Obblighi DEVE sul periodo",
      body: `Hai **${monthlyRequired}** vincoli di obbligo (intera giornata o turno preciso) su questo piano. ` +
        "Se la stessa persona è anche segnata come non disponibile su quel giorno/turno — o se regole di co-presenza impediscono la combinazione — il piano diventa impossibile.",
    });
  }

  if (coPresenceRules > 0) {
    suggestions.push({
      id: "co-rules",
      title: "Regole persone / ruolo",
      body: `Ci sono **${coPresenceRules}** regole di co-presenza o esclusione (calendario o questo turno). ` +
        "Sono trattate come **vincoli rigidi**: anche una sola combinazione vietata su molti giorni può bloccare tutta la generazione. " +
        "Configurazione calendario → sezione regole.",
    });
  }

  if (teamMembers === 0) {
    suggestions.push({
      id: "no-members",
      title: "Nessuna persona attiva",
      body: "Aggiungi persone al calendario prima di generare.",
    });
  } else if (maxMinStaffOnSingleSlot > teamMembers) {
    suggestions.push({
      id: "min-staff-exceeds-team",
      title: "«Min staff» più alto del numero di persone",
      body: `Almeno un tipo turno richiede ${maxMinStaffOnSingleSlot} persone contemporaneamente, ma nel team ci sono solo ${teamMembers} persone attive. Riduci il minimo richiesto o aggiungi persone.`,
    });
  }

  if (sumContractMaxShifts != null && slotsToCover > 0 && sumContractMaxShifts < slotsToCover) {
    suggestions.push({
      id: "sum-caps",
      title: "Massimali turni mensili (somma)",
      body: `Per coprire i minimi mancanti servono almeno ${slotsToCover} assegnazioni nuove nel periodo, ma la somma dei massimali contrattuali mensili impostati sulle persone è ${sumContractMaxShifts}. Aumenta i massimali dove possibile, rimuovi un tetto su chi può fare di più, o riduci i requisiti di copertura.`,
    });
  }

  if (monthlyUnavailable > 0 || input.monthlyConstraintsCount > 0) {
    suggestions.push({
      id: "monthly-unavail",
      title: "Indisponibilità sul periodo",
      body:
        `Ci sono **${monthlyUnavailable}** vincoli di non disponibilità e **${monthlyRequired}** di obbligo su questo piano ` +
        `(${input.monthlyConstraintsCount} voci totali nel mese). ` +
        "Ridurli dalla scheda persona sulla griglia se sono troppo stretti.",
    });
  }

  suggestions.push({
    id: "shift-types",
    title: "Tipi turno e giorni attivi",
    body: "Verifica «min staff» e i giorni della settimana in cui ogni tipo è attivo: coperture troppo alte su troppi giorni aumentano molto il fabbisogno. Allinea anche «max staff» se usi vincoli di sovraffollamento.",
  });

  suggestions.push({
    id: "rest-consecutive",
    title: "Riposi, notti e giorni consecutivi",
    body: "Se il problema non è solo «quanti» turni ma «come» combinarli, controlla regole calendario (riposo dopo notte), giorni consecutivi massimi e ore minime tra turni sulle singole persone: possono rendere impossibile un piano anche con abbastanza persone in teoria.",
  });

  return {
    stats: {
      slotsToCover,
      assignmentsAlreadyFixed: input.fixedAssignments.length,
      teamMembers,
      jollyCount,
      sumContractMaxShifts,
      maxMinStaffOnSingleSlot,
      monthlyUnavailable,
      monthlyRequired,
      coPresenceRules,
    },
    suggestions,
  };
}
