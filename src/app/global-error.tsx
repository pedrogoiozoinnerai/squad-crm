"use client";

/** Última linha de defesa: pega erro no próprio layout raiz, e por isso
 *  precisa renderizar <html> e <body> por conta própria. */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="pt-BR">
      <body
        style={{
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#faf9f7",
          color: "#0f172a",
          margin: 0,
        }}
      >
        <div style={{ maxWidth: 420, padding: 32, textAlign: "center" }}>
          <h1 style={{ fontSize: 20, fontWeight: 600 }}>O aplicativo não carregou</h1>
          <p style={{ marginTop: 8, fontSize: 14, color: "#78716c" }}>
            Recarregue a página. Se continuar, me mande o código abaixo.
          </p>
          {error.digest && (
            <p style={{ marginTop: 12, fontFamily: "monospace", fontSize: 12, color: "#78716c" }}>
              {error.digest}
            </p>
          )}
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 24, padding: "10px 20px", borderRadius: 12, border: 0,
              background: "#1c7d42", color: "#fff", fontWeight: 600, cursor: "pointer",
            }}
          >
            Recarregar
          </button>
        </div>
      </body>
    </html>
  );
}
