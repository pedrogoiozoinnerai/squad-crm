import Link from "next/link";
import { ExternalLink, Eye, ShieldCheck } from "lucide-react";

import { LossReasonList, type LossReasonRow } from "@/components/settings/LossReasonList";
import { StageList, type StageRow } from "@/components/settings/StageList";
import { TaskTemplateList, type TemplateRow } from "@/components/settings/TaskTemplateList";
import { PageHeader } from "@/components/shell/PageHeader";
import { SerieList, type SerieRow } from "@/components/settings/SerieList";

export type AutomationRow = {
  id: string;
  dueInDays: number;
  active: boolean;
  template: { name: string };
  targetStage: { name: string; color: string };
};

export type CaseRow = {
  id: string;
  title: string;
  client: string;
  segment: string;
  highlight: string;
  metric: string;
  summary: string;
  link: string | null;
  active: boolean;
};

export const SECOES = ["etapas", "motivos", "templates", "sessoes", "automacoes"] as const;
export type Secao = (typeof SECOES)[number];

export function SettingsView({
  basePath,
  secao,
  stages,
  lossReasons,
  templates,
  automations,
  cases,
  series,
  owners,
}: {
  basePath: string;
  secao: Secao;
  stages: StageRow[];
  lossReasons: LossReasonRow[];
  templates: TemplateRow[];
  automations: AutomationRow[];
  cases: CaseRow[];
  series: SerieRow[];
  owners: { id: string; name: string }[];
}) {
  const abas: { key: Secao; label: string; count: number }[] = [
    { key: "etapas", label: "Etapas do pipeline", count: stages.length },
    { key: "motivos", label: "Motivos de perda", count: lossReasons.length },
    { key: "templates", label: "Templates de tarefa", count: templates.length },
    { key: "sessoes", label: "Sessões recorrentes", count: series.length },
    { key: "automacoes", label: "Automações e cases", count: automations.length + cases.length },
  ];

  return (
    <>
      <PageHeader
        title="Configurações"
        subtitle="O que a operação usa todo dia: as etapas do funil, os motivos de perda e os modelos de tarefa."
      />

      <p className="card mb-5 flex items-start gap-2.5 border-waz-80 bg-waz-95 p-4 text-sm text-waz-20">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" />
        <span>
          O que muda aqui vale para o time inteiro na hora — e nada nesta tela apaga negócio:
          item que já está em uso só pode ser <strong>desativado</strong>, nunca excluído. A
          contagem ao lado de cada linha mostra quantos registros dependem dele.
        </span>
      </p>

      <nav className="mb-5 flex flex-wrap items-center gap-1.5">
        {abas.map((aba) => (
          <Link
            key={aba.key}
            href={aba.key === "etapas" ? basePath : `${basePath}?secao=${aba.key}`}
            className={`chip border transition ${
              secao === aba.key
                ? "border-waz-50 bg-waz-95 text-waz-20"
                : "border-line bg-surface text-muted hover:text-foreground"
            }`}
          >
            {aba.label}
            <span className={secao === aba.key ? "text-waz-30" : "text-muted/70"}>{aba.count}</span>
          </Link>
        ))}
      </nav>

      {secao === "etapas" && <StageList stages={stages} />}
      {secao === "motivos" && <LossReasonList reasons={lossReasons} />}
      {secao === "templates" && <TaskTemplateList templates={templates} />}
      {secao === "sessoes" && <SerieList series={series} owners={owners} />}
      {secao === "automacoes" && <ReadOnlySection automations={automations} cases={cases} />}
    </>
  );
}

/**
 * Automações e cases ainda saem do seed. Ficam visíveis porque o admin precisa
 * saber o que dispara sozinho no pipeline antes de mexer nas etapas.
 */
function ReadOnlySection({
  automations,
  cases,
}: {
  automations: AutomationRow[];
  cases: CaseRow[];
}) {
  return (
    <div className="flex flex-col gap-4">
      <p className="card flex items-start gap-2.5 border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <Eye className="mt-0.5 size-4 shrink-0" />
        <span>
          <strong>Somente leitura nesta primeira versão.</strong> As automações de tarefa e os
          cases de sucesso ainda vêm do seed; editar por aqui entra na próxima. O que dá para
          fazer hoje é desativar o template que a automação usa, na aba{" "}
          <em>Templates de tarefa</em> — a automação para de criar a tarefa na hora.
        </span>
      </p>

      <section className="card overflow-hidden">
        <header className="border-b border-line px-5 py-4">
          <h2 className="text-sm font-semibold">Automações de tarefa</h2>
          <p className="mt-0.5 text-xs text-muted">
            Quando um negócio entra na etapa, a tarefa do template nasce sozinha — é o que faz o
            pipeline andar sem depender da memória do vendedor.
          </p>
        </header>

        {automations.length === 0 ? (
          <p className="px-5 py-14 text-center text-sm text-muted">
            Nenhuma automação configurada. Hoje elas são criadas pelo seed do banco.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs font-semibold text-muted">
                  <th className="px-5 py-3">Ao entrar na etapa</th>
                  <th className="px-5 py-3">Cria a tarefa</th>
                  <th className="px-5 py-3">Prazo</th>
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {automations.map((automation) => (
                  <tr
                    key={automation.id}
                    className={`border-b border-line last:border-b-0 ${
                      automation.active ? "" : "opacity-60"
                    }`}
                  >
                    <td className="px-5 py-3">
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className="size-2 rounded-full"
                          style={{ backgroundColor: automation.targetStage.color }}
                        />
                        {automation.targetStage.name}
                      </span>
                    </td>
                    <td className="px-5 py-3 font-medium">{automation.template.name}</td>
                    <td className="px-5 py-3 text-muted">
                      {automation.dueInDays === 0
                        ? "no mesmo dia"
                        : `+${automation.dueInDays} ${automation.dueInDays === 1 ? "dia" : "dias"}`}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`chip ${
                          automation.active ? "bg-waz-95 text-waz-20" : "bg-surface-2 text-muted"
                        }`}
                      >
                        {automation.active ? "Ativa" : "Inativa"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card overflow-hidden">
        <header className="border-b border-line px-5 py-4">
          <h2 className="text-sm font-semibold">Cases de sucesso</h2>
          <p className="mt-0.5 text-xs text-muted">
            Prova social sugerida dentro do negócio, priorizando o case do mesmo setor do lead.
          </p>
        </header>

        {cases.length === 0 ? (
          <p className="px-5 py-14 text-center text-sm text-muted">
            Nenhum case cadastrado. Hoje eles são criados pelo seed do banco.
          </p>
        ) : (
          <ul className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-3">
            {cases.map((item) => (
              <li
                key={item.id}
                className={`rounded-xl border border-line bg-surface-2/40 p-4 ${
                  item.active ? "" : "opacity-60"
                }`}
              >
                <p className="flex items-baseline gap-2">
                  <span className="text-xl font-semibold tracking-tight text-waz-20">
                    {item.highlight}
                  </span>
                  <span className="text-xs text-muted">{item.metric}</span>
                </p>
                <p className="mt-2 text-sm font-medium">{item.title}</p>
                <p className="text-xs text-muted">
                  {item.client} · {item.segment}
                </p>
                <p className="mt-2 text-xs text-muted">{item.summary}</p>
                {item.link && (
                  <a
                    href={item.link}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-waz-30 hover:underline"
                  >
                    Ver case
                    <ExternalLink className="size-3" />
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
