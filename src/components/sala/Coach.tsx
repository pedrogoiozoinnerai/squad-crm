"use client";

import { useState, useTransition } from "react";
import { Check, PanelLeftClose, Sparkles } from "lucide-react";

import { marcarBloco } from "@/app/actions/coach";

export type BlocoDoRoteiro = {
  id: string;
  ordem: number;
  nome: string;
  objetivo: string | null;
  minutosAlvo: number | null;
};

/**
 * O roteiro da call, ao vivo.
 *
 * É o mesmo dado que vira a rubrica da análise depois — por isso marcar aqui
 * não é só um lembrete: é a declaração do vendedor sobre o que fez e quando,
 * que a IA vai confrontar com a transcrição.
 *
 * Só o closer vê. O lead não pode saber que existe um roteiro sendo seguido.
 */
export function Coach({
  meetingId,
  blocos,
  marcados,
  segundoAtual,
}: {
  meetingId: string;
  blocos: BlocoDoRoteiro[];
  marcados: Record<string, number>;
  /// Quantos segundos de call já se passaram — é o que é gravado na marcação.
  segundoAtual: () => number;
}) {
  const [feitos, setFeitos] = useState<Record<string, number>>(marcados);
  const [, aplicando] = useTransition();
  const [aberto, setAberto] = useState(true);

  const total = blocos.length;
  const quantos = Object.keys(feitos).length;
  const previsto = blocos.reduce((t, b) => t + (b.minutosAlvo ?? 0), 0);

  function alternar(bloco: BlocoDoRoteiro) {
    const marcar = !(bloco.id in feitos);
    const segundo = segundoAtual();

    // Marca na hora e manda depois: numa call ao vivo, esperar o servidor para
    // ver o risco riscar é tempo que o vendedor passa olhando a tela em vez do
    // lead.
    setFeitos((atual) => {
      const proximo = { ...atual };
      if (marcar) proximo[bloco.id] = segundo;
      else delete proximo[bloco.id];
      return proximo;
    });

    aplicando(async () => {
      try {
        await marcarBloco({ meetingId, blocoId: bloco.id, segundo, marcar });
      } catch {
        // Desfaz: a lista não pode mostrar um bloco marcado que o banco não tem.
        setFeitos((atual) => {
          const proximo = { ...atual };
          if (marcar) delete proximo[bloco.id];
          else proximo[bloco.id] = segundo;
          return proximo;
        });
      }
    });
  }

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="flex h-full w-12 shrink-0 flex-col items-center gap-3 rounded-2xl bg-[#131c33] py-4 text-white/60 transition hover:text-white"
        aria-label="Abrir o roteiro da call"
      >
        <Sparkles className="size-5" />
        <span className="text-xs font-semibold tabular-nums">
          {quantos}/{total}
        </span>
      </button>
    );
  }

  return (
    <aside className="flex w-[280px] shrink-0 flex-col overflow-hidden rounded-2xl bg-[#131c33]">
      <header className="flex items-center gap-2 px-4 py-3.5">
        <Sparkles className="size-4 text-waz-50" />
        <h2 className="flex-1 text-[11px] font-semibold tracking-[0.14em] text-white/80 uppercase">
          Live Coach
        </h2>
        <button
          type="button"
          onClick={() => setAberto(false)}
          className="text-white/40 transition hover:text-white"
          aria-label="Recolher o roteiro"
        >
          <PanelLeftClose className="size-4" />
        </button>
      </header>

      <div className="flex items-baseline justify-between px-4 pb-3">
        <span className="text-[11px] font-semibold tracking-[0.12em] text-white/40 uppercase">
          Roteiro da call
        </span>
        <span className="text-sm font-semibold text-white/70 tabular-nums">
          {quantos}/{total}
        </span>
      </div>

      <div className="mx-4 mb-3 h-1 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-waz-50 transition-all"
          style={{ width: `${total ? (quantos / total) * 100 : 0}%` }}
        />
      </div>

      <ol className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {blocos.map((bloco) => {
          const feito = bloco.id in feitos;
          return (
            <li key={bloco.id}>
              <button
                type="button"
                onClick={() => alternar(bloco)}
                title={bloco.objetivo ?? undefined}
                aria-pressed={feito}
                className="flex w-full items-start gap-2.5 rounded-xl px-2 py-2.5 text-left transition hover:bg-white/5"
              >
                <span
                  className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border transition ${
                    feito ? "border-waz-50 bg-waz-50 text-[#0d1424]" : "border-white/25"
                  }`}
                >
                  {feito && <Check className="size-3" strokeWidth={3} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={`block text-sm leading-snug transition ${
                      feito ? "text-white/35 line-through" : "text-white/80"
                    }`}
                  >
                    {bloco.nome}
                  </span>
                  {feito && (
                    <span className="mt-0.5 block text-[11px] text-white/30 tabular-nums">
                      aos {Math.floor(feitos[bloco.id] / 60)} min
                    </span>
                  )}
                </span>
                {!feito && bloco.minutosAlvo && (
                  <span className="mt-0.5 shrink-0 text-[11px] text-white/25 tabular-nums">
                    {bloco.minutosAlvo}′
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ol>

      <p className="border-t border-white/5 px-4 py-3 text-[11px] leading-relaxed text-white/30">
        {previsto} minutos previstos. O que você marcar aqui vira a rubrica da
        análise desta call.
      </p>
    </aside>
  );
}
