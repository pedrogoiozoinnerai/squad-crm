import { Mail, Phone, Trophy, Undo2, X } from "lucide-react";

import { closeDeal, reopenDeal } from "@/app/actions/deals";
import { DealPanels } from "@/components/pipeline/DealPanels";
import { DealSidePanel } from "@/components/pipeline/DealSidePanel";
import { StageStepper } from "@/components/pipeline/StageStepper";
import { Drawer } from "@/components/ui/Drawer";
import { Copiavel } from "@/components/ui/Copiavel";
import { ScoreBadge } from "@/components/ui/ScoreBadge";
import type { SessionUser } from "@/lib/auth";
import { getDealDetail, getLossReasons, getRelevantCases, getStages } from "@/lib/queries";

const STATUS = {
  OPEN: { text: "Pendente", tone: "bg-amber-50 text-amber-800" },
  WON: { text: "Ganho", tone: "bg-waz-90 text-waz-20" },
  LOST: { text: "Perdido", tone: "bg-red-50 text-red-700" },
} as const;

export async function DealDrawer({
  dealId,
  user,
  closeHref,
}: {
  dealId: string;
  user: SessionUser;
  closeHref: string;
}) {
  const deal = await getDealDetail(user, dealId);

  if (!deal) {
    return (
      <Drawer closeHref={closeHref} title="Negócio não encontrado">
        <p className="text-sm text-muted">
          Este negócio não existe ou não está no seu escopo de acesso.
        </p>
      </Drawer>
    );
  }

  const [stages, cases, lossReasons] = await Promise.all([
    getStages(),
    getRelevantCases(deal.lead.segment),
    getLossReasons(),
  ]);

  const status = STATUS[deal.status];
  const isOpen = deal.status === "OPEN";
  const nextMeeting = deal.lead.meetings[0]?.startsAt ?? null;

  return (
    <Drawer
      width="wide"
      closeHref={closeHref}
      title={<Copiavel valor={deal.lead.name} titulo="Copiar o nome" />}
      tituloAcessivel={deal.lead.name}
      badge={<ScoreBadge score={deal.lead.score} />}
      subtitle={
        <span className="flex flex-col gap-1.5">
          {deal.lead.company && (
            <Copiavel
              valor={deal.lead.company}
              titulo="Copiar a empresa"
              className="text-base text-foreground"
            />
          )}
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            {deal.lead.email && (
              <span className="inline-flex items-center gap-1.5">
                <Mail className="size-3.5 shrink-0" />
                <Copiavel valor={deal.lead.email} titulo="Copiar o e-mail" />
              </span>
            )}
            {deal.lead.phone && (
              <>
                <span className="inline-flex items-center gap-1.5">
                  <Phone className="size-3.5 shrink-0" />
                  <Copiavel valor={deal.lead.phone} titulo="Copiar o telefone" />
                </span>
                <a href={`tel:${deal.lead.phone}`} className="btn-ghost py-1.5 text-xs">
                  <Phone className="size-3.5" />
                  Ligar
                </a>
              </>
            )}
          </span>
        </span>
      }
      actions={
        <>
          <span className={`chip ${status.tone}`}>
            {status.text}
            {deal.status === "LOST" && deal.lossReason && ` · ${deal.lossReason.name}`}
          </span>

          {isOpen ? (
            <>
              <form action={closeDeal} className="flex items-center gap-1.5">
                <input type="hidden" name="id" value={deal.id} />
                <input type="hidden" name="outcome" value="lost" />
                <select
                  name="lossReasonId"
                  required
                  defaultValue=""
                  aria-label="Motivo da perda"
                  className="field w-40 py-1.5 text-xs"
                >
                  <option value="" disabled>
                    Motivo…
                  </option>
                  {lossReasons.map((reason) => (
                    <option key={reason.id} value={reason.id}>
                      {reason.name}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="btn border border-line bg-surface px-3 py-2 text-xs text-red-700 hover:bg-red-50"
                >
                  <X className="size-3.5" />
                  Perdido
                </button>
              </form>

              <form action={closeDeal}>
                <input type="hidden" name="id" value={deal.id} />
                <input type="hidden" name="outcome" value="won" />
                <button
                  type="submit"
                  disabled={deal.mentorshipStatus !== "CONCLUIDA"}
                  title={
                    deal.mentorshipStatus !== "CONCLUIDA"
                      ? "Conclua a Mentoria Estratégica antes de marcar como ganho"
                      : undefined
                  }
                  className="btn bg-waz-30 px-3 py-2 text-xs text-white hover:bg-waz-20"
                >
                  <Trophy className="size-3.5" />
                  Ganho
                </button>
              </form>
            </>
          ) : (
            <form action={reopenDeal}>
              <input type="hidden" name="id" value={deal.id} />
              <button type="submit" className="btn-ghost px-3 py-2 text-xs">
                <Undo2 className="size-3.5" />
                Reabrir
              </button>
            </form>
          )}
        </>
      }
      headerExtra={
        <StageStepper
          stages={stages}
          currentStageId={deal.stageId}
          dealId={deal.id}
          disabled={!isOpen}
        />
      }
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <DealSidePanel deal={deal} nextMeetingAt={nextMeeting} />

        <DealPanels
          dealId={deal.id}
          leadId={deal.leadId}
          leadName={deal.lead.name}
          leadPhone={deal.lead.phone}
          leadSegment={deal.lead.segment}
          tasks={deal.tasks}
          activities={deal.activities}
          cases={cases}
        />
      </div>
    </Drawer>
  );
}
