"use client";

import { useOptimistic, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlarmClock, CalendarClock, ClipboardList, Phone, UserRound } from "lucide-react";

import { moveDeal } from "@/app/actions/deals";
import { ScoreBadge } from "@/components/ui/ScoreBadge";
import { brl, diaMes, diasEntre, hhmm, prazoRelativo, rotuloDeDias } from "@/lib/dates";

export type BoardStage = {
  id: string;
  key: string;
  name: string;
  color: string;
  /// Quantos negócios a etapa tem de verdade, e quanto somam. Vem do banco:
  /// a coluna mostra no máximo os 60 mais recentes, e contar os cartões
  /// visíveis daria uma previsão de receita menor que a real.
  total: number;
  valueCents: number;
  weightedCents: number;
};

export type BoardDeal = {
  id: string;
  code: string;
  stageId: string;
  leadId: string;
  valueCents: number;
  probability: number;
  expectedAt: Date | null;
  updatedAt: Date;
  lead: {
    id: string;
    name: string;
    company: string | null;
    phone: string | null;
    score: string | null;
  };
  owner: { name: string };
  tarefasPendentes: number;
  tarefasAtrasadas: number;
  proximaTarefa: Date | null;
  reuniao: { startsAt: Date; status: string } | null;
};

/// Um negócio sem toque há tanto tempo já não é "em andamento".
const DIAS_PARA_ESFRIAR = 14;

const REUNIAO = {
  DONE: { texto: "Participou", tom: "bg-waz-90 text-waz-20" },
  NO_SHOW: { texto: "Não compareceu", tom: "bg-red-50 text-red-700" },
} as const;

export function PipelineBoard({
  stages,
  deals,
  showOwner,
  basePath,
  filtrado,
  agora,
}: {
  stages: BoardStage[];
  deals: BoardDeal[];
  showOwner: boolean;
  basePath: string;
  /// Com filtro ativo, coluna vazia quer dizer "nada bateu", não "etapa vazia".
  /// Só o total da etapa não distingue os dois casos: ele também é filtrado.
  filtrado: boolean;
  /// O relógio vem do servidor e desce como prop. Se cada lado calculasse o
  /// seu, "atrasada 3d" no HTML viraria "atrasada 4d" na reidratação.
  agora: Date;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [dragOver, setDragOver] = useState<string | null>(null);
  // Sem isso, soltar o card em cima da própria coluna abriria o drawer.
  // Guardo o instante do último arraste em vez de um booleano: se o `dragend`
  // não chegar (drag cancelado), o card não trava para sempre.
  // `event.timeStamp` em vez de Date.now(): mesma base de tempo, e é leitura pura.
  const lastDragAt = useRef(0);

  // Move o card na hora; o servidor confirma (ou o revalidate desfaz).
  const [board, applyMove] = useOptimistic(
    deals,
    (current, move: { dealId: string; stageId: string }) =>
      current.map((deal) =>
        deal.id === move.dealId ? { ...deal, stageId: move.stageId } : deal,
      ),
  );

  const [falha, setFalha] = useState<string | null>(null);

  function handleDrop(stageId: string, dealId: string, at: number) {
    setDragOver(null);
    lastDragAt.current = at;
    if (!dealId) return;
    startTransition(async () => {
      applyMove({ dealId, stageId });
      try {
        await moveDeal({ dealId, stageId });
        setFalha(null);
      } catch (erro) {
        // Sem este `catch`, a action lançava (negócio já fechado, por exemplo),
        // o erro subia para o boundary e a PÁGINA INTEIRA virava "algo quebrou"
        // — com o card ainda desenhado na coluna nova pelo `useOptimistic`, o
        // que fazia parecer que tinha funcionado.
        setFalha(erro instanceof Error ? erro.message : "Não foi possível mover este negócio.");
        // Devolve o board à verdade do servidor: o otimista é descartado.
        router.refresh();
      }
    });
  }

  function abrir(dealId: string) {
    router.push(`${basePath}?deal=${dealId}`);
  }

  return (
    <>
      {falha && (
        <p role="alert" className="mb-3 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700">
          {falha}
        </p>
      )}
    <div className="flex gap-4 overflow-x-auto pb-4">
      {stages.map((stage) => {
        const items = board.filter((deal) => deal.stageId === stage.id);
        const escondidos = Math.max(0, stage.total - items.length);
        const atrasados = items.filter((deal) => deal.tarefasAtrasadas > 0).length;
        const isOver = dragOver === stage.id;

        return (
          <section
            key={stage.id}
            onDragOver={(event) => {
              event.preventDefault();
              setDragOver(stage.id);
            }}
            onDragLeave={() => setDragOver((s) => (s === stage.id ? null : s))}
            onDrop={(event) => {
              event.preventDefault();
              handleDrop(stage.id, event.dataTransfer.getData("text/deal-id"), event.timeStamp);
            }}
            className={`flex w-[300px] shrink-0 flex-col rounded-2xl border p-3 transition ${
              isOver ? "border-waz-50 bg-waz-95" : "border-line bg-surface"
            }`}
          >
            <header className="mb-3 px-1">
              <div className="flex items-center gap-2">
                <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: stage.color }} />
                <h2 className="truncate text-sm font-semibold">{stage.name}</h2>
                <span className="ml-auto shrink-0 text-xs font-semibold text-muted tabular-nums">
                  {stage.total}
                </span>
              </div>

              <p className="mt-1.5 text-xs text-muted tabular-nums">
                <span className="font-semibold text-foreground">{brl(stage.valueCents)}</span>
                {" · "}
                {brl(stage.weightedCents)} ponderado
              </p>

              <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-muted">
                {atrasados > 0 && (
                  <span className="font-semibold text-red-700">
                    {atrasados} com tarefa atrasada
                  </span>
                )}
                {escondidos > 0 && <span>mostrando {items.length} de {stage.total}</span>}
              </div>
            </header>

            <div className="flex min-h-[120px] flex-col gap-2">
              {items.length === 0 && (
                <p className="rounded-xl border border-dashed border-line px-3 py-8 text-center text-xs text-muted">
                  {filtrado
                    ? "Nenhum negócio desta etapa bate com o filtro."
                    : "Arraste negócios para cá"}
                </p>
              )}

              {items.map((deal) => {
                const atrasada = deal.tarefasAtrasadas > 0;
                const semProximoPasso = deal.tarefasPendentes === 0;
                const parado = diasEntre(deal.updatedAt, agora);
                const prazo = deal.proximaTarefa ? prazoRelativo(deal.proximaTarefa, agora) : null;
                // No histórico do HubSpot muito contato tem o nome da empresa
                // repetido no campo de empresa. Imprimir as duas linhas iguais
                // rouba altura do cartão para não dizer nada.
                const empresa =
                  deal.lead.company?.trim().toLowerCase() === deal.lead.name.trim().toLowerCase()
                    ? null
                    : deal.lead.company;
                const reuniao = deal.reuniao;
                const rotuloReuniao =
                  reuniao && reuniao.status in REUNIAO
                    ? REUNIAO[reuniao.status as keyof typeof REUNIAO]
                    : null;

                return (
                  <article
                    key={deal.id}
                    draggable
                    role="button"
                    tabIndex={0}
                    aria-label={`Abrir negócio de ${deal.lead.name}`}
                    onDragStart={(event) => {
                      lastDragAt.current = event.timeStamp;
                      event.dataTransfer.setData("text/deal-id", deal.id);
                      event.dataTransfer.effectAllowed = "move";
                    }}
                    onDragEnd={(event) => {
                      lastDragAt.current = event.timeStamp;
                    }}
                    onClick={(event) => {
                      // Clique logo após um arraste é o fim do arraste, não um clique.
                      if (event.timeStamp - lastDragAt.current < 300) return;
                      abrir(deal.id);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        abrir(deal.id);
                      }
                    }}
                    className={`cursor-pointer rounded-xl border border-l-[3px] bg-surface-2/60 p-3 transition
                      hover:border-waz-60 focus:outline-none focus-visible:ring-4 focus-visible:ring-waz-90
                      active:cursor-grabbing ${
                        atrasada
                          ? "border-line border-l-red-500 bg-red-50/40"
                          : "border-line border-l-line"
                      }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 truncate text-sm font-semibold">{deal.lead.name}</p>
                      <ScoreBadge score={deal.lead.score} />
                    </div>

                    {(atrasada || rotuloReuniao) && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {atrasada && (
                          <span className="chip bg-red-50 px-2 py-0.5 text-[11px] text-red-700">
                            <AlarmClock className="size-3" />
                            {deal.tarefasAtrasadas}{" "}
                            {deal.tarefasAtrasadas === 1 ? "atrasada" : "atrasadas"}
                          </span>
                        )}
                        {rotuloReuniao && (
                          <span className={`chip px-2 py-0.5 text-[11px] ${rotuloReuniao.tom}`}>
                            {rotuloReuniao.texto}
                          </span>
                        )}
                      </div>
                    )}

                    {(empresa || deal.lead.phone) && (
                      <p className="mt-1.5 flex items-center gap-1.5 truncate text-xs text-muted">
                        {empresa && <span className="truncate">{empresa}</span>}
                        {empresa && deal.lead.phone && <span>·</span>}
                        {deal.lead.phone && (
                          <span className="inline-flex shrink-0 items-center gap-1 tabular-nums">
                            <Phone className="size-3" />
                            {deal.lead.phone}
                          </span>
                        )}
                      </p>
                    )}

                    {reuniao && (
                      <p className="mt-1.5 inline-flex items-center gap-1 text-xs text-muted tabular-nums">
                        <CalendarClock className="size-3" />
                        {diaMes(reuniao.startsAt)} · {hhmm(reuniao.startsAt)}
                      </p>
                    )}

                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-waz-20 tabular-nums">
                        {brl(deal.valueCents)}
                      </span>
                      <span className="chip bg-surface px-2 py-0.5 text-[11px] text-muted ring-1 ring-line tabular-nums">
                        {deal.probability}%
                      </span>
                    </div>

                    <div className="mt-2 flex items-center justify-between gap-2 border-t border-line pt-2 text-[11px] text-muted">
                      <span className="inline-flex items-center gap-1">
                        <ClipboardList className="size-3" />
                        {semProximoPasso ? (
                          "Sem próximo passo"
                        ) : (
                          <>
                            {deal.tarefasPendentes}{" "}
                            {deal.tarefasPendentes === 1 ? "tarefa" : "tarefas"}
                            {deal.proximaTarefa && (
                              <span className="tabular-nums"> · {diaMes(deal.proximaTarefa)}</span>
                            )}
                          </>
                        )}
                      </span>

                      {prazo ? (
                        <span
                          className={`shrink-0 font-semibold ${prazo.atrasado ? "text-red-700" : ""}`}
                        >
                          {prazo.texto}
                        </span>
                      ) : (
                        parado >= DIAS_PARA_ESFRIAR && (
                          <span className="shrink-0" title={`Sem movimento há ${parado} dias`}>
                            parado {rotuloDeDias(parado)}
                          </span>
                        )
                      )}
                    </div>

                    {showOwner && (
                      <p className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-muted">
                        <UserRound className="size-3" />
                        {deal.owner.name}
                      </p>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
    </>
  );
}
