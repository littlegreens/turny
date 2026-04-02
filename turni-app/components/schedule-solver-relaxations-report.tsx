import Link from "next/link";
import {
  formatIsoDateIt,
  isSolverRelaxationAlert,
  solverRelaxationShortTitle,
} from "@/lib/solver-relaxations-report";

type Props = {
  alerts: unknown;
  /** Se true e non ci sono avvisi salvati, non renderizza nulla (né titolo). */
  showEmptyHint?: boolean;
  /** Link opzionale al report mensile (stesso periodo). */
  monthReportHref?: string | null;
};

export function ScheduleSolverRelaxationsReport({ alerts, showEmptyHint, monthReportHref }: Props) {
  const raw = Array.isArray(alerts) ? alerts.filter(isSolverRelaxationAlert) : [];
  const list = raw.filter((a) => String((a as { type?: unknown }).type) !== "RELAXATION_APPLIED");
  if (list.length === 0) {
    if (!showEmptyHint) return null;
    return (
      <section className="card mt-3">
        <div className="card-body">
          <h2 className="h6 fw-semibold mb-2">Cosa ha ceduto il motore (ultima generazione)</h2>
          <p className="small text-secondary mb-0">
            Non ci sono note salvate dall’ultima «Genera turni» con compromessi visibili qui, oppure non è ancora stata
            eseguita una generazione da quando questa sezione è stata aggiunta.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="card mt-3 border-warning">
      <div className="card-body">
        <h2 className="h6 fw-semibold mb-1">Cosa ha ceduto il motore (ultima generazione)</h2>
        <p className="small text-secondary mb-3">
          Elenco in linguaggio semplice di regole che il sistema avrebbe voluto rispettare alla lettera, ma ha dovuto
          ammorbidire per chiudere il piano. Non è un errore di calcolo: è un compromesso da rivedere a mano dove serve.
        </p>
        <div className="d-flex flex-column gap-3">
          {list.map((a, i) => {
            const type = String(a.type ?? "");
            const msg = typeof a.message === "string" ? a.message : "";
            const title = solverRelaxationShortTitle(type);

            const chi = typeof a.memberLabel === "string" ? a.memberLabel : null;
            const da = typeof a.fromDate === "string" ? a.fromDate : null;
            const aAl = typeof a.toDate === "string" ? a.toDate : null;
            const nomeRegola = typeof a.ruleName === "string" ? a.ruleName : null;
            const shiftNm = typeof a.shiftTypeName === "string" ? a.shiftTypeName : null;
            const giornoSlot = typeof a.date === "string" ? a.date : null;
            const ruleLbl = typeof a.ruleLabel === "string" ? a.ruleLabel : null;

            return (
              <div key={`${type}-${i}`} className="border rounded p-3 bg-body-secondary bg-opacity-25">
                <div className="fw-semibold small text-warning-emphasis mb-2">{title}</div>
                {type === "DOW_RULE_RELAXED" && (chi || da || aAl || nomeRegola) ? (
                  <dl className="row small mb-2 mb-md-0">
                    {chi ? (
                      <>
                        <dt className="col-sm-3 text-secondary">Chi</dt>
                        <dd className="col-sm-9 mb-1">{chi}</dd>
                      </>
                    ) : null}
                    {da ? (
                      <>
                        <dt className="col-sm-3 text-secondary">Primo giorno</dt>
                        <dd className="col-sm-9 mb-1">{formatIsoDateIt(da)}</dd>
                      </>
                    ) : null}
                    {aAl ? (
                      <>
                        <dt className="col-sm-3 text-secondary">Giorno collegato</dt>
                        <dd className="col-sm-9 mb-1">{formatIsoDateIt(aAl)}</dd>
                      </>
                    ) : null}
                    {nomeRegola ? (
                      <>
                        <dt className="col-sm-3 text-secondary">Nome regola in calendario</dt>
                        <dd className="col-sm-9 mb-0">{nomeRegola}</dd>
                      </>
                    ) : null}
                  </dl>
                ) : null}
                {(type === "ALWAYS_WITH_RELAXED" ||
                  type === "NEVER_WITH_RELAXED" ||
                  type === "COVERAGE_SHORTFALL") &&
                (giornoSlot || shiftNm || ruleLbl) ? (
                  <dl className="row small mb-2 mb-md-0">
                    {giornoSlot ? (
                      <>
                        <dt className="col-sm-3 text-secondary">Giorno</dt>
                        <dd className="col-sm-9 mb-1">{formatIsoDateIt(giornoSlot)}</dd>
                      </>
                    ) : null}
                    {shiftNm ? (
                      <>
                        <dt className="col-sm-3 text-secondary">Fascia turno</dt>
                        <dd className="col-sm-9 mb-1">{shiftNm}</dd>
                      </>
                    ) : null}
                    {ruleLbl ? (
                      <>
                        <dt className="col-sm-3 text-secondary">Regola co-presenza</dt>
                        <dd className="col-sm-9 mb-0">{ruleLbl}</dd>
                      </>
                    ) : null}
                  </dl>
                ) : null}
                <p className="small mb-0 text-body">{msg}</p>
              </div>
            );
          })}
        </div>
        {monthReportHref ? (
          <p className="small text-secondary mb-0 mt-3">
            <Link href={monthReportHref}>Report completo del periodo (copertura, CSV, riepilogo)</Link>
          </p>
        ) : null}
      </div>
    </section>
  );
}
