"use client";

import Link from "next/link";
import type { InfeasibilityHints } from "@/lib/infeasibility-hints";

type Props = {
  open: boolean;
  onClose: () => void;
  message: string;
  hints: InfeasibilityHints | null;
  orgSlug: string;
  calId: string;
};

export function InfeasibleGenerateModal({ open, onClose, message, hints, orgSlug, calId }: Props) {
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
                Il motore OR-Tools non trova una combinazione che rispetti tutti i vincoli contemporaneamente. Non riceviamo il
                «motivo» preciso dal solver: sotto trovi conteggi utili e azioni tipiche che sbloccano il problema.
              </p>

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
                        <div className="text-secondary">Membri team</div>
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
                      <div className="fw-semibold mb-1">Turni extra e «chi può coprirli»</div>
                      <p className="mb-2 text-secondary mb-0">
                        Se il collo di bottiglia è <strong>quantitativo</strong> (servono più assegnazioni di quante i massimali
                        consentono), annota quanti turni extra servono e quali persone possono farli. Poi, nel calendario:
                        aumenta il massimale mensile su quei membri, oppure segnali come <strong>jolly</strong> chi accetta di
                        essere usato con priorità più bassa per riempire i buchi. Se mancano proprio le persone, aggiungi membri
                        o abbassa il minimo di copertura sui tipi turno.
                      </p>
                    </div>
                  </div>
                </>
              ) : (
                <p className="small text-secondary mb-0">
                  Controlla coperture minime, indisponibilità del periodo, massimali contrattuali e regole di riposo sul calendario
                  e sui singoli membri.
                </p>
              )}

              <div className="mt-3">
                <Link href={calHref} className="btn btn-sm btn-success" onClick={onClose}>
                  Apri il calendario (membri, tipi turno, regole)
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
