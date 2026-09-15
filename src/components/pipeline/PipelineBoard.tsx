"use client";

import { useOptimistic, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Calendar, ClipboardList, Phone } from "lucide-react";

import { moveDeal } from "@/app/actions/deals";
import { ScoreBadge } from "@/components/ui/ScoreBadge";
import { brl } from "@/lib/dates";

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
};

export type BoardDeal = {
  id: string;
  code: string;
  stageId: string;
  valueCents: number;
  probability: number;
  expectedAt: Date | null;
  lead: {
    id: string;
    name: string;
    company: string | null;
    phone: string | null;
    score: string | null;
  };
  owner: { name: string };
  _count: { tasks: number };
};

export function PipelineBoard({
  stages,
  deals,
  showOwner,
  basePath,
}: {
  stages: BoardStage[];
  deals: BoardDeal[];
  showOwner: boolean;
  basePath: string;
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

  function handleDrop(stageId: string, dealId: string, at: number) {
    setDragOver(null);
    lastDragAt.current = at;
    if (!dealId) return;
    startTransition(async () => {
      applyMove({ dealId, stageId });
      await moveDeal({ dealId, stageId });
    });
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {stages.map((stage) => {
        const items = board.filter((deal) => deal.stageId === stage.id);
        const escondidos = Math.max(0, stage.total - items.length);
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
            className={`flex w-[290px] shrink-0 flex-col rounded-2xl border p-3 transition ${
              isOver ? "border-waz-50 bg-waz-95" : "border-line bg-surface"
            }`}
          >
            <header className="mb-3 px-1">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <span
                  className="size-2 rounded-full"
                  style={{ backgroundColor: stage.color }}
                />
                {stage.name}
              </h2>
              <p className="mt-1 text-xs text-muted">
                {stage.total} {stage.total === 1 ? "negócio" : "negócios"} ·{" "}
                <span className="font-semibold text-foreground">{brl(stage.valueCents)}</span>
              </p>
              {escondidos > 0 && (
                <p className="mt-0.5 text-xs text-muted">
                  mostrando os {items.length} mais recentes
                </p>
              )}
            </header>

            <div className="flex min-h-[120px] flex-col gap-2">
              {items.length === 0 && (
                <p className="rounded-xl border border-dashed border-line px-3 py-8 text-center text-xs text-muted">
                  Arraste negócios para cá
                </p>
              )}

              {items.map((deal) => (
                <article
                  key={deal.id}
                  draggable
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
                    router.push(`${basePath}?deal=${deal.id}`);
                  }}
                  className="cursor-pointer rounded-xl border border-line bg-surface-2/60 p-3 transition hover:border-waz-60 active:cursor-grabbing"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{deal.lead.name}</p>
                      {deal.lead.company && (
                        <p className="truncate text-xs text-muted">{deal.lead.company}</p>
                      )}
                    </div>
                    <ScoreBadge score={deal.lead.score} />
                  </div>

                  <p className="mt-2 text-sm font-semibold text-waz-20">{brl(deal.valueCents)}</p>

                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
                    {deal.expectedAt && (
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="size-3" />
                        {deal.expectedAt.toLocaleDateString("pt-BR", {
                          day: "2-digit",
                          month: "2-digit",
                        })}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1">
                      <ClipboardList className="size-3" />
                      {deal._count.tasks}
                    </span>
                    {deal.lead.phone && (
                      <span className="inline-flex items-center gap-1">
                        <Phone className="size-3" />
                        {deal.lead.phone}
                      </span>
                    )}
                    <span className="chip ml-auto bg-surface text-muted ring-1 ring-line">
                      {deal.probability}%
                    </span>
                  </div>

                  {showOwner && (
                    <p className="mt-2 text-[11px] text-muted">{deal.owner.name}</p>
                  )}
                </article>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
