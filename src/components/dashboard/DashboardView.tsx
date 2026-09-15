import Link from "next/link";
import { AlertTriangle, CalendarDays, TrendingUp, Trophy, XCircle } from "lucide-react";

import { PageHeader } from "@/components/shell/PageHeader";
import { brl } from "@/lib/dates";

type Funil = {
  id: string;
  name: string;
  color: string;
  targetRole: string | null;
  count: number;
  valueCents: number;
};

export type DashboardData = {
  pipelineBruto: number;
  pipelinePonderado: number;
  previstoMes: number;
  ganhosMes: { count: number; valueCents: number };
  perdidosMes: { count: number; valueCents: number };
  funil: Funil[];
  perdas: { motivo: string; count: number; valueCents: number }[];
  tarefas: { pendentes: number; vencidas: number; automaticas: number };
  leads: Record<string, number>;
  reunioesSemana: number;
  ranking: { nome: string; count: number; valueCents: number }[];
};

export function DashboardView({
  data,
  space,
  userName,
  isAdmin,
}: {
  data: DashboardData;
  space: string;
  userName: string;
  isAdmin: boolean;
}) {
  const maiorEtapa = Math.max(1, ...data.funil.map((f) => f.count));
  const maiorPerda = Math.max(1, ...data.perdas.map((p) => p.count));
  const totalPerdas = data.perdas.reduce((s, p) => s + p.count, 0);

  return (
    <>
      <PageHeader
        title={`Olá, ${userName.split(" ")[0]}`}
        subtitle={isAdmin ? "Visão da operação inteira" : "A sua operação de hoje"}
        actions={
          data.tarefas.vencidas > 0 && (
            <Link href={`/${space}/tarefas`} className="chip bg-red-50 text-red-700">
              <AlertTriangle className="size-3.5" />
              {data.tarefas.vencidas} {data.tarefas.vencidas === 1 ? "tarefa atrasada" : "tarefas atrasadas"}
            </Link>
          )
        }
      />

      {/* ── Dinheiro ─────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Pipeline aberto"
          value={brl(data.pipelineBruto)}
          hint={`${brl(data.pipelinePonderado)} ponderado pela probabilidade`}
          icon={TrendingUp}
        />
        <Metric
          label="Previsto para o mês"
          value={brl(data.previstoMes)}
          hint="Soma ponderada do que tem previsão neste mês"
          icon={CalendarDays}
        />
        <Metric
          label="Ganho no mês"
          value={brl(data.ganhosMes.valueCents)}
          hint={`${data.ganhosMes.count} ${data.ganhosMes.count === 1 ? "negócio fechado" : "negócios fechados"}`}
          icon={Trophy}
          tone="positivo"
        />
        <Metric
          label="Perdido no mês"
          value={brl(data.perdidosMes.valueCents)}
          hint={`${data.perdidosMes.count} ${data.perdidosMes.count === 1 ? "negócio perdido" : "negócios perdidos"}`}
          icon={XCircle}
          tone="negativo"
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {/* ── Funil ──────────────────────────────────────────────── */}
        <section className="card p-5">
          <header className="mb-4 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold">Funil por etapa</h2>
            <Link href={`/${space}/pipeline`} className="text-xs font-semibold text-waz-30 hover:underline">
              Abrir pipeline →
            </Link>
          </header>

          <ul className="flex flex-col gap-3">
            {data.funil.map((etapa) => (
              <li key={etapa.id}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: etapa.color }} />
                    <span className="truncate font-medium">{etapa.name}</span>
                    {etapa.targetRole && (
                      <span className="chip shrink-0 bg-surface-2 text-[10px] text-muted">
                        {etapa.targetRole}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-muted">
                    {etapa.count} · <strong className="text-foreground">{brl(etapa.valueCents)}</strong>
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${(etapa.count / maiorEtapa) * 100}%`,
                      backgroundColor: etapa.color,
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* ── Perdas por motivo ──────────────────────────────────── */}
        <section className="card p-5">
          <header className="mb-4 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold">Por que perdemos</h2>
            <span className="text-xs text-muted">{totalPerdas} no total</span>
          </header>

          {data.perdas.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line px-3 py-10 text-center text-xs text-muted">
              Nenhuma perda registrada ainda.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {data.perdas.map((perda) => (
                <li key={perda.motivo}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="truncate font-medium">{perda.motivo}</span>
                    <span className="shrink-0 text-muted">
                      {perda.count} · {brl(perda.valueCents)}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
                    <div
                      className="h-full rounded-full bg-red-400 transition-all"
                      style={{ width: `${(perda.count / maiorPerda) * 100}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* ── Operação ─────────────────────────────────────────────── */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MiniCard
          href={`/${space}/tarefas`}
          label="Tarefas pendentes"
          value={data.tarefas.pendentes}
          hint={
            data.tarefas.automaticas > 0
              ? `${data.tarefas.automaticas} criadas por automação`
              : "nenhuma automática"
          }
        />
        <MiniCard href={`/${space}/calendar`} label="Reuniões na semana" value={data.reunioesSemana} />
        {/* O número grande é o que exige ação hoje: lead completo esperando
            contato. Antes o destaque era o incompleto, então a tela dizia "0"
            enquanto dois leads prontos esperavam — e quem lesse só o número
            concluiria que não havia nada a fazer. */}
        <MiniCard
          href={`/${space}/leads`}
          label="Leads para contatar"
          value={data.leads.COMPLETE ?? 0}
          hint={`${data.leads.INCOMPLETE ?? 0} ainda sem qualificação`}
        />
        <MiniCard
          href={`/${space}/leads`}
          label="Leads convertidos"
          value={data.leads.CONVERTED ?? 0}
          hint={`${data.leads.LOST ?? 0} ${(data.leads.LOST ?? 0) === 1 ? "perdido" : "perdidos"}`}
        />
      </div>

      {/* ── Ranking (só admin) ───────────────────────────────────── */}
      {isAdmin && data.ranking.length > 0 && (
        <section className="card mt-4 p-5">
          <h2 className="mb-4 text-sm font-semibold">Pipeline aberto por closer</h2>
          <ul className="flex flex-col gap-2">
            {data.ranking.map((linha, i) => (
              <li
                key={linha.nome}
                className="flex items-center justify-between gap-3 rounded-xl bg-surface-2/50 px-3 py-2.5 text-sm"
              >
                <span className="flex items-center gap-2.5">
                  <span className="grid size-6 place-items-center rounded-full bg-waz-90 text-[11px] font-bold text-waz-20">
                    {i + 1}
                  </span>
                  {linha.nome}
                </span>
                <span className="text-muted">
                  {linha.count} · <strong className="text-foreground">{brl(linha.valueCents)}</strong>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function Metric({
  label,
  value,
  hint,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: React.ElementType;
  tone?: "positivo" | "negativo";
}) {
  const cor =
    tone === "positivo" ? "text-waz-20" : tone === "negativo" ? "text-red-700" : "text-foreground";

  return (
    <div className="card p-5">
      <p className="flex items-center gap-2 text-xs font-semibold text-muted">
        <Icon className="size-3.5" />
        {label}
      </p>
      <p className={`mt-2 text-2xl font-semibold tracking-tight ${cor}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

function MiniCard({
  href,
  label,
  value,
  hint,
}: {
  href: string;
  label: string;
  value: number;
  hint?: string;
}) {
  return (
    <Link href={href} className="card p-4 transition hover:border-waz-60">
      <p className="text-xs font-semibold text-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-muted">{hint}</p>}
    </Link>
  );
}
