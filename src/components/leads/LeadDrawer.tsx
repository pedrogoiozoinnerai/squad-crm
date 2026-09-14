import { LeadActions } from "@/components/leads/LeadActions";
import { LeadForm } from "@/components/leads/LeadForm";
import { Drawer } from "@/components/ui/Drawer";
import { ScoreBadge } from "@/components/ui/ScoreBadge";
import { Timeline, type TimelineItem } from "@/components/ui/Timeline";
import type { SessionUser } from "@/lib/auth";
import { getLeadDetail, getOwners } from "@/lib/queries";

const STATUS_LABEL = {
  INCOMPLETE: { text: "Incompleto", tone: "bg-surface-2 text-muted" },
  COMPLETE: { text: "Completo", tone: "bg-sky-50 text-sky-700" },
  CONVERTED: { text: "Convertido", tone: "bg-waz-90 text-waz-20" },
  LOST: { text: "Perdido", tone: "bg-red-50 text-red-700" },
} as const;

export async function LeadDrawer({
  leadId,
  user,
  closeHref,
}: {
  leadId: string;
  user: SessionUser;
  closeHref: string;
}) {
  const isNew = leadId === "new";
  const owners = user.role === "ADMIN" ? await getOwners() : null;
  const lead = isNew ? null : await getLeadDetail(user, leadId);

  if (!isNew && !lead) {
    return (
      <Drawer closeHref={closeHref} title="Lead não encontrado">
        <p className="text-sm text-muted">
          Este lead não existe ou não está no seu escopo de acesso.
        </p>
      </Drawer>
    );
  }

  const status = lead ? STATUS_LABEL[lead.status] : null;

  const timeline: TimelineItem[] = lead
    ? [
        ...lead.activities,
        ...lead.noteEntries.map((note) => ({
          id: note.id,
          kind: "NOTE_ADDED" as const,
          title: "Anotação",
          detail: note.content,
          createdAt: note.createdAt,
          author: note.author,
        })),
      ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    : [];

  return (
    <Drawer
      closeHref={closeHref}
      title={lead?.name ?? "Novo lead"}
      badge={status && <span className={`chip ${status.tone}`}>{status.text}</span>}
      subtitle={
        lead && (
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {lead.company && <span>{lead.company}</span>}
            {lead.email && <span>{lead.email}</span>}
            {lead.phone && <span>{lead.phone}</span>}
            <ScoreBadge score={lead.score} />
          </span>
        )
      }
    >
      <LeadForm
        lead={lead}
        closeHref={isNew ? closeHref : ""}
        owners={owners}
        defaultOwnerId={user.id}
      />

      {lead && (
        <>
          <LeadActions
            leadId={lead.id}
            hasDeal={Boolean(lead.deal)}
            isClosed={lead.status === "LOST" || lead.status === "CONVERTED"}
          />

          <section className="mt-7 border-t border-line pt-6">
            <h3 className="mb-3 text-xs font-semibold tracking-wider text-muted uppercase">
              Linha do tempo
            </h3>
            <Timeline items={timeline} />
          </section>
        </>
      )}
    </Drawer>
  );
}
