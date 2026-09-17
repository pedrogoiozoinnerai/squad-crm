"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";

import { buscarLeads } from "@/app/actions/meetings";

type Lead = { id: string; name: string; company: string | null };

/**
 * Escolher o lead da reunião, ou nenhum.
 *
 * Busca no servidor em vez de um `<select>` com a carteira inteira: são
 * milhares de leads, e mandar todos ao navegador para escolher um é peso
 * inútil em toda abertura da tela.
 *
 * "Sem lead" é uma escolha de primeira classe, não a ausência de uma: reunião
 * interna, alinhamento de time e bloqueio de agenda são reunião também, e
 * antes disto não havia como marcar nenhuma delas.
 */
export function SeletorDeLead({ inicial }: { inicial?: Lead }) {
  const [escolhido, setEscolhido] = useState<Lead | null>(inicial ?? null);
  const [termo, setTermo] = useState("");
  const [achados, setAchados] = useState<Lead[]>([]);
  const [buscando, setBuscando] = useState(false);

  // Só a última busca vale. Sem isto, uma resposta lenta de "ana" chegando
  // depois de "ana paula" sobrescreveria a lista certa pela antiga.
  const pedido = useRef(0);

  const termoValido = !escolhido && termo.trim().length >= 2;

  useEffect(() => {
    if (!termoValido) return;
    const q = termo.trim();
    const meu = ++pedido.current;

    // Espera a pessoa parar de digitar: uma consulta por tecla seria uma
    // consulta ao banco por tecla. O `setBuscando` mora DENTRO do timer, e não
    // no corpo do efeito — assim nenhuma renderização é encadeada por outra
    // antes de a busca sequer começar.
    const timer = setTimeout(async () => {
      if (meu !== pedido.current) return;
      setBuscando(true);
      try {
        const r = await buscarLeads(q);
        if (meu === pedido.current) setAchados(r);
      } finally {
        if (meu === pedido.current) setBuscando(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [termo, termoValido]);

  // Derivado, e não `setAchados([])` no efeito: com o termo curto ou o lead já
  // escolhido, a lista NÃO É para aparecer — isso se sabe na renderização, sem
  // precisar de um estado que corrige o anterior.
  const lista = termoValido ? achados : [];

  if (escolhido) {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-muted">Lead</span>
        <div className="flex items-center justify-between gap-2 rounded-xl border border-line bg-surface-2/60 px-3 py-2">
          <input type="hidden" name="leadId" value={escolhido.id} />
          <span className="min-w-0 text-sm">
            <span className="block truncate font-medium">{escolhido.name}</span>
            {escolhido.company && (
              <span className="block truncate text-xs text-muted">{escolhido.company}</span>
            )}
          </span>
          <button
            type="button"
            onClick={() => {
              setEscolhido(null);
              setTermo("");
            }}
            aria-label="Trocar o lead"
            className="shrink-0 rounded-lg p-1 text-muted transition hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-muted">Lead</span>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
        <input
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          placeholder="Buscar por nome, empresa ou e-mail…"
          className="field pl-9"
          autoComplete="off"
        />
      </div>

      {lista.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-xl border border-line bg-surface p-1">
          {lista.map((lead) => (
            <li key={lead.id}>
              <button
                type="button"
                onClick={() => setEscolhido(lead)}
                className="w-full rounded-lg px-2.5 py-1.5 text-left text-sm transition hover:bg-surface-2"
              >
                <span className="block truncate font-medium">{lead.name}</span>
                {lead.company && (
                  <span className="block truncate text-xs text-muted">{lead.company}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      <span className="text-[11px] text-muted">
        {buscando
          ? "Procurando…"
          : termoValido && lista.length === 0
            ? "Nenhum lead com esse termo. Sem lead, a reunião fica só na sua agenda."
            : "Deixe em branco para uma reunião interna, sem lead."}
      </span>
    </div>
  );
}
