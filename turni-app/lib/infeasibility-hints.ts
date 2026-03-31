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
}): InfeasibilityHints {
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

  if (jollyCount === 0 && teamMembers >= 2) {
    const sample = input.members
      .filter((m) => !m.isJolly)
      .slice(0, 4)
      .map((m) => memberLabel(m.user.firstName, m.user.lastName, m.user.email))
      .join(", ");
    suggestions.push({
      id: "jolly",
      title: "Persone «jolly» (copertura extra)",
      body:
        "Il generatore penalizza leggermente chi è marcato «jolly» quando distribuisce i turni. Se alcune persone possono accettare straordinari o turni extra, segnale come jolly nella scheda persona del calendario: libera capacità utile quando il piano è molto stretto." +
        (sample ? ` Esempi di persone non jolly: ${sample}.` : ""),
    });
  }

  if (input.monthlyConstraintsCount > 0) {
    suggestions.push({
      id: "monthly-unavail",
      title: "Indisponibilità sul periodo",
      body: `Ci sono ${input.monthlyConstraintsCount} vincoli mensili (giorni o singoli turni) che riducono le combinazioni possibili. Rivedi dalla griglia (scheda persona) o dalle indisponibilità registrate per questo mese.`,
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
    },
    suggestions,
  };
}
