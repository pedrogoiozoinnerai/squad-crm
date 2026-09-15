"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";

/**
 * Valor que se copia com um clique.
 *
 * Nome, telefone e e-mail são o que o vendedor mais move para fora do CRM —
 * para o WhatsApp, para a discagem, para o e-mail. Sem isto ele seleciona com o
 * mouse, quase sempre pega um espaço a mais, e cola errado.
 *
 * O feedback é obrigatório: sem ele a pessoa clica de novo achando que falhou.
 */
type Estado = "parado" | "copiado" | "selecionado";

export function Copiavel({
  valor,
  children,
  className = "",
  titulo,
}: {
  valor: string | null | undefined;
  children?: React.ReactNode;
  className?: string;
  titulo?: string;
}) {
  const [estado, setEstado] = useState<Estado>("parado");
  // Referência em vez de `id`: o mesmo valor aparece em mais de um lugar da
  // tela — a empresa está no cabeçalho e no painel — e dois elementos com o
  // mesmo id são HTML inválido, com o recuo pegando o errado.
  const alvo = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (estado === "parado") return;
    const t = setTimeout(() => setEstado("parado"), 1800);
    return () => clearTimeout(t);
  }, [estado]);

  // Sem valor não há o que copiar: vira texto comum, sem cursor de clique nem
  // promessa de interação que não vai acontecer.
  if (!valor) return <span className={className}>{children ?? "—"}</span>;

  async function copiar() {
    try {
      await navigator.clipboard.writeText(valor!);
      setEstado("copiado");
      return;
    } catch {
      // A área de transferência pode ser negada por permissão — acontece em
      // navegador embutido e em página servida sem HTTPS. Em vez de não fazer
      // nada, seleciona o texto: aí Ctrl+C resolve, e o aviso explica.
      const sel = window.getSelection();
      if (alvo.current && sel) {
        const range = document.createRange();
        range.selectNodeContents(alvo.current);
        sel.removeAllRanges();
        sel.addRange(range);
        setEstado("selecionado");
      }
    }
  }

  return (
    <button
      type="button"
      onClick={copiar}
      title={titulo ?? `Copiar ${valor}`}
      aria-label={`Copiar ${valor}`}
      className={`group inline-flex max-w-full items-center gap-1.5 text-left transition hover:text-waz-30 ${className}`}
    >
      <span ref={alvo} className="truncate">
        {children ?? valor}
      </span>

      {estado === "copiado" ? (
        <Check className="size-3.5 shrink-0 text-waz-30" aria-hidden />
      ) : estado === "selecionado" ? (
        <span className="shrink-0 text-[10px] font-semibold tracking-wide text-muted uppercase">
          Ctrl+C
        </span>
      ) : (
        // Visível de leve o tempo todo, forte no hover: só no hover ninguém
        // descobre que dá para clicar, e a função fica existindo para quem já
        // sabia que ela existe.
        <Copy
          className="size-3.5 shrink-0 text-muted/40 transition group-hover:text-muted"
          aria-hidden
        />
      )}

      <span className="sr-only" role="status">
        {estado === "copiado" ? "Copiado" : estado === "selecionado" ? "Selecionado, use Ctrl+C" : ""}
      </span>
    </button>
  );
}
