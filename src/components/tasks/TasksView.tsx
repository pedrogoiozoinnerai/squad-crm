import { Check, Circle, MessageCircle } from "lucide-react";

import { toggleTask } from "@/app/actions/tasks";
import { PageHeader } from "@/components/shell/PageHeader";
import { StatBar } from "@/components/ui/Stat";
import { Acao } from "@/components/ui/Acao";
import { linkWhatsapp, renderizarMensagem } from "@/lib/mensagem";
import { TZ } from "@/lib/dates";

type Task = {
  id: string;
  subject: string;
  type: string;
  status: "PENDING" | "DONE" | "CANCELED";
  priority: "LOW" | "MEDIUM" | "HIGH";
  dueAt: Date | null;
  /// Corpo da tarefa. Veio junto na migração e não aparecia em lugar nenhum:
  /// o vendedor lia "Verificar se a Meta foi aprovada" sem saber o que checar.
  description: string | null;
  lead: { name: string; phone: string | null; company: string | null } | null;
  deal: { code: string; stage: { name: string; color: string } } | null;
  owner: { name: string };
  /// Mensagem pronta do modelo que originou a tarefa.
  template: { messageText: string | null } | null;
};

const PRIORITY: Record<Task["priority"], { label: string; tone: string }> = {
  HIGH: { label: "Alta", tone: "bg-red-50 text-red-700" },
  MEDIUM: { label: "Média", tone: "bg-amber-50 text-amber-800" },
  LOW: { label: "Baixa", tone: "bg-surface-2 text-muted" },
};

const TYPE_LABEL: Record<string, string> = {
  follow_up: "Follow-up",
  call: "Call",
  call_individual: "Call individual",
  message: "Mensagem",
};

function dueLabel(dueAt: Date | null, now: number) {
  if (!dueAt) return { text: "—", overdue: false };

  const diffDays = Math.round((dueAt.getTime() - now) / 86_400_000);
  const date = dueAt.toLocaleDateString("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit" });

  if (diffDays < 0) return { text: `${date} · atrasada`, overdue: true };
  if (diffDays === 0) return { text: `${date} · hoje`, overdue: true };
  if (diffDays === 1) return { text: `${date} · amanhã`, overdue: false };
  return { text: `${date} · em ${diffDays} dias`, overdue: false };
}

export function TasksView({
  tasks,
  totais,
  showOwner,
  now,
}: {
  tasks: Task[];
  /// Contagens do banco, sobre a fila inteira. `tasks` é só o topo dela:
  /// contar o array daria um número menor que a verdade no cabeçalho.
  totais: { pendentes: number; atrasadas: number; concluidas: number };
  showOwner: boolean;
  /** Instante único vindo do servidor: todas as linhas comparam com o mesmo "agora". */
  now: Date;
}) {
  const reference = now.getTime();
  const escondidas = Math.max(0, totais.pendentes + totais.concluidas - tasks.length);

  return (
    <>
      <PageHeader
        title="Tarefas"
        subtitle={
          escondidas > 0
            ? `Sua fila de trabalho do dia — mostrando as ${tasks.length} mais urgentes`
            : "Sua fila de trabalho do dia"
        }
      />

      <StatBar
        items={[
          { label: "Pendentes", value: totais.pendentes },
          {
            label: "Atrasadas",
            value: (
              <span className={totais.atrasadas ? "text-red-600" : ""}>{totais.atrasadas}</span>
            ),
          },
          { label: "Concluídas", value: totais.concluidas },
        ]}
      />

      {/* `overflow-x-auto` e largura mínima, como as outras cinco tabelas do
          projeto. Dentro de `overflow-hidden` puro, as oito colunas se
          esmagavam e o que não encolhia era CORTADO, sem barra para alcançar. */}
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs font-semibold text-muted">
              <th className="w-12 px-4 py-3" />
              <th className="px-4 py-3">Assunto</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Prioridade</th>
              <th className="px-4 py-3">Prazo</th>
              <th className="px-4 py-3">Lead</th>
              <th className="px-4 py-3">Etapa</th>
              {showOwner && <th className="px-4 py-3">Responsável</th>}
            </tr>
          </thead>
          <tbody>
            {tasks.length === 0 && (
              <tr>
                <td colSpan={showOwner ? 8 : 7} className="px-4 py-14 text-center text-muted">
                  Nenhuma tarefa por aqui.
                </td>
              </tr>
            )}

            {tasks.map((task) => {
              const due = dueLabel(task.dueAt, reference);
              const done = task.status === "DONE";
              // A mensagem do modelo entra já preenchida no link. Sem isso o
              // vendedor abre a conversa em branco e reescreve a frase — que é
              // como a padronização do discurso se perde na prática.
              const whatsapp = linkWhatsapp(
                task.lead?.phone,
                task.template?.messageText
                  ? renderizarMensagem(task.template.messageText, {
                      nome: task.lead?.name,
                      closer: task.owner.name,
                      empresa: task.lead?.company,
                    })
                  : null,
              );

              return (
                <tr
                  key={task.id}
                  className={`border-b border-line last:border-b-0 transition hover:bg-surface-2/50 ${done ? "opacity-55" : ""}`}
                >
                  <td className="px-4 py-3">
                    <Acao action={toggleTask} mensagem="Não deu para concluir a tarefa.">
                      <input type="hidden" name="taskId" value={task.id} />
                      <button
                        type="submit"
                        aria-label={done ? "Reabrir tarefa" : "Concluir tarefa"}
                        className={`grid size-6 place-items-center rounded-full border transition ${
                          done
                            ? "border-waz-50 bg-waz-50 text-white"
                            : "border-line text-transparent hover:border-waz-50"
                        }`}
                      >
                        {done ? <Check className="size-3.5" /> : <Circle className="size-3" />}
                      </button>
                    </Acao>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`font-medium ${done ? "line-through" : ""}`}>
                      {task.subject}
                    </span>
                    {task.description && (
                      <span className="mt-0.5 block max-w-[38ch] truncate text-xs text-muted" title={task.description}>
                        {task.description}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {TYPE_LABEL[task.type] ?? task.type}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`chip ${PRIORITY[task.priority].tone}`}>
                      {PRIORITY[task.priority].label}
                    </span>
                  </td>
                  <td
                    className={`px-4 py-3 ${due.overdue && !done ? "font-semibold text-red-600" : "text-muted"}`}
                  >
                    {due.text}
                  </td>
                  <td className="px-4 py-3">
                    {task.lead ? (
                      <>
                        <span className="block">{task.lead.name}</span>
                        {task.lead.phone && (
                          <span className="block text-xs text-muted">{task.lead.phone}</span>
                        )}
                        {whatsapp && !done && (
                          <a
                            href={whatsapp}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-waz-30 hover:underline"
                          >
                            <MessageCircle className="size-3" />
                            {task.template?.messageText ? "Abrir com a mensagem" : "WhatsApp"}
                          </a>
                        )}
                      </>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {task.deal ? (
                      <span className="inline-flex items-center gap-1.5 text-muted">
                        <span
                          className="size-2 rounded-full"
                          style={{ backgroundColor: task.deal.stage.color }}
                        />
                        {task.deal.stage.name}
                      </span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  {showOwner && <td className="px-4 py-3 text-muted">{task.owner.name}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
