"use client";

import { useActionState, useEffect, useState } from "react";
import { Calendar, Check, Copy, DollarSign, GraduationCap, Globe, Loader2, MousePointerClick } from "lucide-react";

import { saveDeal } from "@/app/actions/deals";
import { centsToInput, chaveDoDia, diaMes, hhmm, TZ } from "@/lib/dates";
import { Copiavel } from "@/components/ui/Copiavel";
import { FormFeedback } from "@/components/ui/FormFeedback";
import type { FormState } from "@/lib/guard";
import { SalaDoNegocio } from "@/components/pipeline/SalaDoNegocio";

export type SidePanelDeal = {
  id: string;
  code: string;
  status: "OPEN" | "WON" | "LOST";
  valueCents: number;
  product: string | null;
  probability: number;
  expectedAt: Date | null;
  paymentMethod: string | null;
  paymentLink: string | null;
  attendance: "AGENDADO" | "PARTICIPOU" | "NAO_COMPARECEU";
  mentorshipStatus: "PENDENTE" | "AGENDADA" | "CONCLUIDA";
  createdAt: Date;
  owner: { name: string };
  lead: {
    name: string;
    email: string | null;
    phone: string | null;
    company: string | null;
    jobTitle: string | null;
    segment: string | null;
    collaborators: string | null;
    revenueRange: string | null;
    score: string | null;
    trackedLink: string | null;
    linkClicks: number;
    lastLinkClick: Date | null;
    utmSource: string | null;
    utmMedium: string | null;
    utmCampaign: string | null;
    utmTerm: string | null;
    utmContent: string | null;
  };
};

const MENTORSHIP = {
  PENDENTE: { text: "Pendente", tone: "bg-amber-50 text-amber-800" },
  AGENDADA: { text: "Agendada", tone: "bg-sky-50 text-sky-700" },
  CONCLUIDA: { text: "Concluída", tone: "bg-waz-90 text-waz-20" },
} as const;

/**
 * O valor de um `<input type="date">`.
 *
 * `getTimezoneOffset()` é o do relógio de QUEM RENDERIZA — e isto renderiza no
 * servidor, que na Vercel é UTC. Uma previsão marcada para o dia 6 voltava ao
 * campo como dia 5 e, salva de novo, andava um dia para trás a cada edição.
 */
function toDateInput(date: Date | null) {
  return date ? chaveDoDia(date) : "";
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] font-semibold tracking-wider text-muted uppercase">{children}</span>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <section className="card p-4">{children}</section>;
}

export function DealSidePanel({
  deal,
  nextMeetingAt,
  reuniaoId,
  convite,
  link,
  reuniaoFimEm,
}: {
  deal: SidePanelDeal;
  nextMeetingAt: Date | null;
  reuniaoId: string | null;
  convite: string | null;
  link?: string | null;
  reuniaoFimEm: Date | null;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveDeal, null);
  const locked = deal.status !== "OPEN";
  const mentorship = MENTORSHIP[deal.mentorshipStatus];

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={deal.id} />

      {/* ── Agendamento ────────────────────────────────────────────── */}
      <Card>
        <div className="flex items-start justify-between gap-3">
          <p className="flex items-center gap-2">
            <Calendar className="size-4 text-muted" />
            {/* Sem reunião a data some, em vez de virar travessão: o texto
                ao lado já diz que não há nenhuma, e "— sem reunião agendada"
                lê como campo que deveria ter valor e não tem. */}
            {nextMeetingAt && (
              <span className="text-xl font-semibold">{diaMes(nextMeetingAt)}</span>
            )}
            <span className="text-sm text-muted">
              {nextMeetingAt ? (
                `${hhmm(nextMeetingAt)} · ${nextMeetingAt.toLocaleDateString("pt-BR", { timeZone: TZ, weekday: "long" })}`
              ) : (
                // Diz onde marcar. O formulário não cabe aqui dentro: este
                // painel é ele próprio um <form>, e <form> aninhado é HTML
                // inválido — ele fica na aba ao lado, com tarefa e anotação.
                <>
                  sem reunião agendada —{" "}
                  <span className="font-medium text-foreground">
                    marque em &ldquo;Nova Reunião&rdquo;
                  </span>
                </>
              )}
            </span>
          </p>
          <span className="font-mono text-xs text-muted">{deal.code}</span>
        </div>

        {/* A sala aparece na janela dela — meia hora antes até o fim. Fora
            disso o botão levaria a uma tela dizendo que ainda não abriu. */}
        {reuniaoId && nextMeetingAt && reuniaoFimEm && (
          <SalaDoNegocio
            reuniaoId={reuniaoId}
            convite={convite}
            link={link}
            comecaEm={nextMeetingAt}
            terminaEm={reuniaoFimEm}
          />
        )}

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <Label>Responsável</Label>
            <input readOnly value={deal.owner.name} className="field bg-surface-2/60" />
          </label>
          <label className="flex flex-col gap-1.5">
            <Label>Assistido</Label>
            <select name="attendance" defaultValue={deal.attendance} className="field">
              <option value="AGENDADO">Agendado</option>
              <option value="PARTICIPOU">Sim (participou)</option>
              <option value="NAO_COMPARECEU">Não compareceu</option>
            </select>
          </label>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <span className="flex flex-col gap-1">
            <Label>Empresa</Label>
            <Copiavel valor={deal.lead.company} className="text-sm font-semibold" />
          </span>
          <span className="flex flex-col gap-1">
            <Label>Cargo</Label>
            <span className="text-sm font-semibold">{deal.lead.jobTitle ?? "—"}</span>
          </span>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <span className="flex flex-col gap-1">
            <Label>Setor</Label>
            <span className="text-sm">{deal.lead.segment ?? "—"}</span>
          </span>
          <span className="flex flex-col gap-1">
            <Label>Colaboradores</Label>
            <span className="text-sm">{deal.lead.collaborators ?? "—"}</span>
          </span>
        </div>

        <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-line pt-3">
          <span className="flex flex-1 flex-col gap-1">
            <Label>Faturamento</Label>
            <span className="flex items-center gap-1.5 text-sm font-semibold">
              <DollarSign className="size-3.5 text-muted" />
              {deal.lead.revenueRange ?? "—"}
            </span>
          </span>
          {deal.lead.trackedLink && (
            <CopyLinkButton link={deal.lead.trackedLink} />
          )}
        </div>
      </Card>

      {/* ── Dados do Negócio ───────────────────────────────────────── */}
      <Card>
        <div className="flex items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <DollarSign className="size-4 text-muted" />
            Dados do Negócio
          </h3>
          {deal.lead.score && (
            <span className="chip bg-surface-2 text-muted">Score {deal.lead.score}</span>
          )}
        </div>

        <p className="mt-2 rounded-lg bg-surface-2/60 px-3 py-2 text-xs text-muted">
          Lead cadastrado em{" "}
          {deal.createdAt.toLocaleString("pt-BR", { timeZone: TZ, dateStyle: "short", timeStyle: "short" })}
        </p>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <Label>Produto</Label>
            <select name="product" defaultValue={deal.product ?? ""} className="field">
              <option value="">Selecione…</option>
              <option value="Starter">Starter</option>
              <option value="Pro">Pro</option>
              <option value="Enterprise">Enterprise</option>
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <Label>Valor (R$)</Label>
            <input
              name="value"
              inputMode="decimal"
              defaultValue={centsToInput(deal.valueCents)}
              className="field"
            />
          </label>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <Label>Pagamento</Label>
            <select name="paymentMethod" defaultValue={deal.paymentMethod ?? ""} className="field">
              <option value="">Selecione…</option>
              <option value="Pix">Pix</option>
              <option value="Cartão">Cartão</option>
              <option value="Boleto">Boleto</option>
              <option value="Transferência">Transferência</option>
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <Label>Previsão</Label>
            <input
              name="expectedAt"
              type="date"
              defaultValue={toDateInput(deal.expectedAt)}
              className="field"
            />
          </label>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <Label>Probabilidade</Label>
            <select name="probability" defaultValue={String(deal.probability)} className="field">
              {[0, 20, 40, 60, 80, 100].map((p) => (
                <option key={p} value={p}>{p}%</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <Label>Link pagamento</Label>
            <input
              name="paymentLink"
              type="url"
              placeholder="https://…"
              defaultValue={deal.paymentLink ?? ""}
              className="field"
            />
          </label>
        </div>

        <FormFeedback state={state} />

        <button type="submit" disabled={pending || locked} className="btn-primary mt-4 w-full">
          {pending && <Loader2 className="size-4 animate-spin" />}
          Salvar negócio
        </button>
      </Card>

      {/* ── Mentoria Estratégica ───────────────────────────────────── */}
      <Card>
        <div className="flex items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <GraduationCap className="size-4 text-muted" />
            Mentoria Estratégica
          </h3>
          <span className={`chip ${mentorship.tone}`}>{mentorship.text}</span>
        </div>
        {/* O texto anterior dizia que o mentor era sorteado e o cliente
            recebia e-mail e convite automaticamente. Nada disso existe — não há
            sequer biblioteca de e-mail no projeto. Era pior que um botão morto:
            o vendedor lia, assumia que o cliente tinha sido avisado, e não
            fazia o contato. */}
        <p className="mt-2 text-xs text-muted">
          Obrigatória antes de dar o <strong className="text-foreground">Ganho</strong> — o botão
          fica bloqueado até você marcar como concluída. Agendar com o mentor e avisar o cliente é
          manual por enquanto.
        </p>
        <label className="mt-3 flex flex-col gap-1.5">
          <Label>Status da mentoria</Label>
          <select
            name="mentorshipStatus"
            defaultValue={deal.mentorshipStatus}
            className="field"
          >
            <option value="PENDENTE">Pendente</option>
            <option value="AGENDADA">Agendada</option>
            <option value="CONCLUIDA">Concluída</option>
          </select>
        </label>
      </Card>

      {/* Só com link rastreado: nada no CRM gera esses links hoje, então para
          todo mundo este cartão mostrava "0 cliques · nenhum acesso" para
          sempre — espaço ocupado dizendo que nada aconteceu. */}
      {deal.lead.trackedLink && (
      <Card>
        <h3 className="flex items-center gap-2 text-[10px] font-semibold tracking-wider text-muted uppercase">
          <MousePointerClick className="size-3.5" />
          Logs de acesso
        </h3>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-sm">Cliques no link</span>
          <span className="chip bg-surface-2 text-muted">{deal.lead.linkClicks}</span>
        </div>
        <p className="mt-2 text-xs text-muted italic">
          {deal.lead.lastLinkClick
            ? `Último acesso em ${deal.lead.lastLinkClick.toLocaleString("pt-BR", { timeZone: TZ, dateStyle: "short", timeStyle: "short" })}.`
            : "Nenhum acesso registrado ainda."}
        </p>
      </Card>
      )}

      {/* ── UTMs ───────────────────────────────────────────────────── */}
      <Card>
        <h3 className="flex items-center gap-2 text-[10px] font-semibold tracking-wider text-muted uppercase">
          <Globe className="size-3.5" />
          Rastreamento (UTMs)
        </h3>
        <dl className="mt-3 flex flex-col gap-1.5 font-mono text-xs">
          {[
            ["Src", deal.lead.utmSource],
            ["Med", deal.lead.utmMedium],
            ["Cmp", deal.lead.utmCampaign],
            ["Term", deal.lead.utmTerm],
            ["Cont", deal.lead.utmContent],
          ].map(([label, value]) => (
            <div key={label} className="flex gap-3">
              <dt className="w-10 shrink-0 text-muted">{label}</dt>
              <dd className="min-w-0 break-all">{value || "—"}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </form>
  );
}

/**
 * Copiar com retorno visual — e com saída quando não dá para copiar.
 *
 * O `navigator.clipboard?.writeText(link)` de antes engolia tudo: sem `await`,
 * sem `catch`, sem sinal. Em contexto sem permissão de área de transferência
 * (navegador embutido, HTTP) o `?.` fazia o botão simplesmente não fazer nada,
 * e a pessoa clicava de novo achando que tinha errado a mira. Os outros três
 * pontos que copiam neste projeto já tratam; este era o que faltava.
 */
function CopyLinkButton({ link }: { link: string }) {
  const [estado, setEstado] = useState<"parado" | "copiado" | "falhou">("parado");

  useEffect(() => {
    if (estado === "parado") return;
    const t = setTimeout(() => setEstado("parado"), 1800);
    return () => clearTimeout(t);
  }, [estado]);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(link);
      setEstado("copiado");
    } catch {
      // Sem área de transferência, o link ainda precisa chegar a algum lugar:
      // seleciona para a pessoa copiar à mão.
      setEstado("falhou");
    }
  }

  return (
    <button
      type="button"
      onClick={() => void copiar()}
      aria-live="polite"
      className="btn-ghost shrink-0 py-2 text-xs"
    >
      {estado === "copiado" ? (
        <Check className="size-3.5 text-waz-30" />
      ) : (
        <Copy className="size-3.5" />
      )}
      {estado === "copiado" ? "Copiado" : estado === "falhou" ? "Copie à mão" : "Copiar link"}
    </button>
  );
}
