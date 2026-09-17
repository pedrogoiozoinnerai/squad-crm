"use client";

import { useState, useTransition } from "react";

import { moveDeal } from "@/app/actions/deals";

/**
 * Trilha de etapas em chevron, como no CRM de referência: a etapa atual fica
 * destacada e clicar numa etapa move o negócio.
 */
export function StageStepper({
  stages,
  currentStageId,
  dealId,
  disabled,
}: {
  stages: { id: string; name: string }[];
  currentStageId: string;
  dealId: string;
  disabled: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [falha, setFalha] = useState<string | null>(null);
  const currentIndex = stages.findIndex((stage) => stage.id === currentStageId);

  return (
    <>
      {falha && (
        <p role="alert" className="mb-2 rounded-xl bg-red-50 px-3.5 py-2 text-xs text-red-700">
          {falha}
        </p>
      )}
    <nav aria-label="Etapas do pipeline" className="flex w-full overflow-x-auto">
      {stages.map((stage, index) => {
        const isCurrent = index === currentIndex;
        const isPast = index < currentIndex;

        return (
          <button
            key={stage.id}
            type="button"
            disabled={disabled || pending || isCurrent}
            aria-current={isCurrent ? "step" : undefined}
            onClick={() =>
              startTransition(async () => {
                try {
                  await moveDeal({ dealId, stageId: stage.id });
                  setFalha(null);
                } catch (erro) {
                  // A action lança quando o negócio já está fechado. Sem o
                  // `catch` isso trocava a gaveta inteira pela página de erro.
                  setFalha(erro instanceof Error ? erro.message : "Não foi possível mover.");
                }
              })
            }
            className={`relative flex-1 shrink-0 px-4 py-3 text-[11px] font-semibold tracking-wider whitespace-nowrap uppercase transition disabled:cursor-default ${
              isCurrent
                ? "bg-waz-30 text-white"
                : isPast
                  ? "bg-waz-95 text-waz-20 hover:bg-waz-90"
                  : "bg-surface-2 text-muted hover:bg-line"
            }`}
            style={{
              clipPath:
                index === 0
                  ? "polygon(0 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 0 100%)"
                  : index === stages.length - 1
                    ? "polygon(0 0, 100% 0, 100% 100%, 0 100%, 12px 50%)"
                    : "polygon(0 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 0 100%, 12px 50%)",
              marginLeft: index === 0 ? 0 : -6,
            }}
          >
            {stage.name}
          </button>
        );
      })}
    </nav>
    </>
  );
}
