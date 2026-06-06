"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="container py-5">
      <div className="card border-danger">
        <div className="card-body">
          <h1 className="h4 text-danger">Qualcosa è andato storto</h1>
          <p className="text-secondary mb-3">
            Si è verificato un errore imprevisto. Puoi riprovare o tornare indietro.
          </p>
          {error.message ? (
            <pre className="small bg-light p-2 rounded mb-3 text-wrap">{error.message}</pre>
          ) : null}
          <button type="button" className="btn btn-primary" onClick={() => reset()}>
            Riprova
          </button>
        </div>
      </div>
    </div>
  );
}
