"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="it">
      <body>
        <div style={{ fontFamily: "system-ui, sans-serif", padding: "2rem", maxWidth: 640 }}>
          <h1 style={{ color: "#b02a37" }}>Errore applicazione</h1>
          <p>Turny ha riscontrato un errore grave. Ricarica la pagina o riprova.</p>
          {error.message ? <pre style={{ fontSize: 12, whiteSpace: "pre-wrap" }}>{error.message}</pre> : null}
          <button type="button" onClick={() => reset()} style={{ marginTop: 16, padding: "8px 16px" }}>
            Riprova
          </button>
        </div>
      </body>
    </html>
  );
}
