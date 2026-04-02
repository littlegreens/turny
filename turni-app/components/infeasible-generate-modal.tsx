"use client";

import Link from "next/link";
import type { InfeasibilityHints } from "@/lib/infeasibility-hints";

export type SolverAlertItem = {
  type: string;
  message?: string;
  memberId?: string;
  date?: string;
  shiftTypeId?: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  message: string;
  hints: InfeasibilityHints | null;
  /** Motivi strutturati restituiti dal motore (conflitti obblighi, riepilogo vincoli, …). */
  solverAlerts?: SolverAlertItem[];
  orgSlug: string;
  calId: string;
};

export function InfeasibleGenerateModal({
  open,
  onClose,
  message,
  hints,
  solverAlerts = [],
  orgSlug,
  calId,
}: Props) {
  if (!open) return null;

  const calHref = `/${orgSlug}/${calId}`;

  return (
    <>
      <div className="modal fade show d-block" tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="infeasible-modal-title">
        <div className="modal-dialog modal-dialog-scrollable modal-lg modal-dialog-centered">
          <div className="modal-content turny-modal">
            <div className="modal-header border-bottom">
              <h5 className="modal-title" id="infeasible-modal-title">
                Generazione non possibile
              </h5>
              <button type="button" className="btn-close" aria-label="Chiudi" onClick={onClose} />
            </div>
            <div className="modal-body">
              <div className="alert alert-warning mb-3" role="status">
                <p className="mb-0 small">{message}</p>
              </div>
              <p className="small text-secondary mb-3">
                Il motore non riesce a chiudere un piano senza violare almeno un vincolo <strong>obbligatorio</strong> nel modello
                (coperture minime, DEVE, co-presenza, riposi tra turni, giorni consecutivi, ecc.).
              </p>

              {solverAlerts.length > 0 ? (
                <div className="mb-4">
                  <h6 className="fw-semibold mb-2">Dettagli dal motore</h6>
                  <ul className="list-unstyled mb-0 d-grid gap-2">
                    {solverAlerts.map((a, i) => (
                      <li key={`${a.type}-${i}`} className="small border rounded p-2 bg-white">
                        <span className="text-secondary me-1">{a.type}:</span>
                        {a.message ?? "—"}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {hints ? (
                <>
                  <h6 className="fw-semibold mb-2">Numeri utili (stima)</h6>
                  <div className="row g-2 mb-4 small">
                    <div className="col-6 col-md-4">
                      <div className="border rounded p-2 h-100 bg-light">
                        <div className="text-secondary">Slot da coprire (nuovi)</div>
                        <div className="fw-bold">{hints.stats.slotsToCover}</div>
                      </div>
                    </div>
                    <div className="col-6 col-md-4">
                      <div className="border rounded p-2 h-100 bg-light">
                        <div className="text-secondary">Già assegnati (fissi)</div>
                        <div className="fw-bold">{hints.stats.assignmentsAlreadyFixed}</div>
                      </div>
                    </div>
                    <div className="col-6 col-md-4">
                      <div className="border rounded p-2 h-100 bg-light">
                        <div className="text-secondary">Persone team</div>
                        <div className="fw-bold">{hints.stats.teamMembers}</div>
                      </div>
                    </div>
                    <div className="col-6 col-md-4">
                      <div className="border rounded p-2 h-100 bg-light">
                        <div className="text-secondary">Jolly</div>
                        <div className="fw-bold">{hints.stats.jollyCount}</div>
                      </div>
                    </div>
                    <div className="col-6 col-md-4">
                      <div className="border rounded p-2 h-100 bg-light">
                        <div className="text-secondary">Somma max turni/mese</div>
                        <div className="fw-bold">{hints.stats.sumContractMaxShifts ?? "—"}</div>
                      </div>
                    </div>
                    <div className="col-6 col-md-4">
                      <div className="border rounded p-2 h-100 bg-light">
                        <div className="text-secondary">Max «min staff» su uno slot</div>
                        <div className="fw-bold">{hints.stats.maxMinStaffOnSingleSlot}</div>
                      </div>
                    </div>
                    <div className="col-6 col-md-4">
                      <div className="border rounded p-2 h-100 bg-light">
                        <div className="text-secondary">Non disp. (periodo)</div>
                        <div className="fw-bold">{hints.stats.monthlyUnavailable}</div>
                      </div>
                    </div>
                    <div className="col-6 col-md-4">
                      <div className="border rounded p-2 h-100 bg-light">
                        <div className="text-secondary">Obblighi DEVE (periodo)</div>
                        <div className="fw-bold">{hints.stats.monthlyRequired}</div>
                      </div>
                    </div>
                    <div className="col-6 col-md-4">
                      <div className="border rounded p-2 h-100 bg-light">
                        <div className="text-secondary">Regole co-presenza</div>
                        <div className="fw-bold">{hints.stats.coPresenceRules}</div>
                      </div>
                    </div>
                  </div>

                  <h6 className="fw-semibold mb-2">Cosa provare</h6>
                  <ul className="list-unstyled mb-0">
                    {hints.suggestions.map((s) => (
                      <li key={s.id} className="mb-3 pb-3 border-bottom border-light">
                        <div className="fw-semibold small">{s.title}</div>
                        <p className="small text-secondary mb-0">{s.body}</p>
                      </li>
                    ))}
                  </ul>

                  <div className="card bg-light border-0 mt-3">
                    <div className="card-body py-3 small">
                      <div className="fw-semibold mb-1">Massimali e turni oltre contratto</div>
                      <p className="mb-0 text-secondary">
                        Quando una generazione <strong>riesce</strong> ma qualcuno supera il massimale mensile indicato in scheda,
                        il piano viene comunque salvato e il <strong>report / avvisi</strong> del turno lo segnalano: il
                        responsabile decide se accettare o correggere a mano. In caso di generazione impossibile, aumentare il
                        tetto sulla scheda persona (o alleggerire vincoli) è spesso la leva giusta — non serve usare i jolly.
                      </p>
                    </div>
                  </div>
                </>
              ) : (
                <p className="small text-secondary mb-0">
                  Controlla coperture minime, indisponibilità del periodo, massimali contrattuali e regole di riposo sul calendario
                  e sulle singole persone.
                </p>
              )}

              <div className="mt-3">
                <Link href={calHref} className="btn btn-sm btn-success" onClick={onClose}>
                  Apri il calendario (persone, tipi turno, regole)
                </Link>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-primary" onClick={onClose}>
                Ho capito
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="modal-backdrop fade show" onClick={onClose} />
    </>
  );
}
