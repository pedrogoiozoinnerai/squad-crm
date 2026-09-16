"use client";

import { useActionState, useState } from "react";
import { CalendarClock, Zap } from "lucide-react";

import { scheduleMeeting, type EstadoDaReuniao } from "@/app/actions/meetings";
import { ReuniaoCriada } from "@/components/reunioes/ReuniaoCriada";
import { SeletorDeLead } from "@/components/reunioes/SeletorDeLead";
import { Field, SubmitRow } from "@/components/ui/Field";
import { LOTACAO_PADRAO } from "@/lib/reuniao";

export type PadraoDaReuniao = {
  /// Já no formato do campo: "2026-10-06T14:00".
  inicioEm?: string;
  duracaoMin?: number;
  tipo?: "GROUP" | "ONE_ON_ONE";
  capacidade?: number;
  leadId?: string;
  leadNome?: string;
  dealId?: string;
  titulo?: string;
  /// Abre já em "agora" — é o caso de quem clicou em começar uma call.
  agora?: boolean;
};

const DURACOES = [15, 30, 45, 60, 90, 120];

function rotuloDeDuracao(m: number) {
  if (m < 60) return `${m} min`;
  if (m === 60) return "1 hora";
  return m % 60 === 0 ? `${m / 60} horas` : `${Math.floor(m / 60)}h${m % 60}`;
}

/**
 * O formulário de marcar reunião — um só, para as cinco telas.
 *
 * Cliente, e não um `<form action>` servido direto, porque a lotação aparece e
 * some com a chave grupo/1:1, o seletor de lead busca enquanto se digita, e o
 * "agora" troca o campo de data por um aviso. O `<form>` por dentro continua
 * sendo um form de verdade.
 *
 * Ao dar certo ele NÃO fecha: vira a tela dos links. Marcar e não sair dali
 * com o endereço é o mesmo que não ter marcado.
 */
export function FormularioDeReuniao({
  padrao,
  owners,
  aoConcluir,
}: {
  padrao?: PadraoDaReuniao;
  /// Só para ADMIN. Ausente, a reunião é de quem está marcando.
  owners?: { id: string; name: string }[];
  aoConcluir?: () => void;
}) {
  const [estado, acao, salvando] = useActionState<EstadoDaReuniao, FormData>(
    scheduleMeeting,
    null,
  );
  const [tipo, setTipo] = useState<"GROUP" | "ONE_ON_ONE">(padrao?.tipo ?? "ONE_ON_ONE");
  const [agora, setAgora] = useState(padrao?.agora ?? false);

  if (estado?.ok && estado.criada) {
    return <ReuniaoCriada criada={estado.criada} aviso={estado.aviso} aoFechar={aoConcluir} />;
  }

  return (
    <form action={acao} className="flex flex-col gap-3">
      {padrao?.dealId && <input type="hidden" name="dealId" value={padrao.dealId} />}
      {agora && <input type="hidden" name="quando" value="agora" />}

      {/* Quando. Duas opções, e "agora" é a primeira porque é a que tem
          pressa: quem vai marcar para semana que vem tem tempo de procurar. */}
      <div className="grid grid-cols-2 gap-2">
        <QuandoBotao
          ativo={agora}
          aoClicar={() => setAgora(true)}
          icone={<Zap className="size-4" />}
          titulo="Agora"
          dica="A sala já abre"
        />
        <QuandoBotao
          ativo={!agora}
          aoClicar={() => setAgora(false)}
          icone={<CalendarClock className="size-4" />}
          titulo="Marcar horário"
          dica="Dia e hora"
        />
      </div>

      {padrao?.leadId ? (
        <input type="hidden" name="leadId" value={padrao.leadId} />
      ) : (
        <SeletorDeLead />
      )}

      <Field label="Título" hint={padrao?.leadId ? "Em branco usa o nome do lead" : undefined}>
        <input
          name="title"
          defaultValue={padrao?.titulo}
          placeholder={padrao?.leadNome ? `Reunião · ${padrao.leadNome}` : "Reunião de alinhamento"}
          className="field"
          required={!padrao?.leadId}
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-3">
        {agora ? (
          <Field label="Começa" hint="No instante em que você criar">
            <p className="field flex items-center gap-2 bg-surface-2/60 text-muted">
              <Zap className="size-3.5 text-waz-30" />
              Agora
            </p>
          </Field>
        ) : (
          <Field label="Início">
            <input
              name="startsAt"
              type="datetime-local"
              defaultValue={padrao?.inicioEm}
              required
              className="field"
            />
          </Field>
        )}

        <Field label="Duração">
          <select name="duration" defaultValue={padrao?.duracaoMin ?? 30} className="field">
            {DURACOES.map((m) => (
              <option key={m} value={m}>
                {rotuloDeDuracao(m)}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Formato">
          <select
            name="type"
            value={tipo}
            onChange={(e) => setTipo(e.target.value as "GROUP" | "ONE_ON_ONE")}
            className="field"
          >
            <option value="ONE_ON_ONE">Individual</option>
            <option value="GROUP">Em grupo</option>
          </select>
        </Field>
      </div>

      {(tipo === "GROUP" || owners) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {tipo === "GROUP" && (
            <Field label="Lotação" hint="Sem isto a sessão não aparece no funil">
              <input
                name="capacity"
                type="number"
                min={1}
                max={500}
                defaultValue={padrao?.capacidade ?? LOTACAO_PADRAO}
                className="field"
              />
            </Field>
          )}
          {owners && (
            <Field label="Quem conduz">
              <select name="ownerId" defaultValue={owners[0]?.id} className="field">
                {owners.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>
      )}

      {estado?.error && (
        <p role="alert" className="rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-700">
          {estado.error}
        </p>
      )}

      <SubmitRow>
        {aoConcluir && (
          <button type="button" onClick={aoConcluir} className="btn-ghost">
            Cancelar
          </button>
        )}
        <button type="submit" disabled={salvando} className="btn-primary">
          {salvando ? "Criando…" : agora ? "Criar e pegar o link" : "Agendar"}
        </button>
      </SubmitRow>
    </form>
  );
}

function QuandoBotao({
  ativo,
  aoClicar,
  icone,
  titulo,
  dica,
}: {
  ativo: boolean;
  aoClicar: () => void;
  icone: React.ReactNode;
  titulo: string;
  dica: string;
}) {
  return (
    <button
      type="button"
      onClick={aoClicar}
      aria-pressed={ativo}
      className={`flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-left transition ${
        ativo
          ? "border-waz-50 bg-waz-95 text-waz-10"
          : "border-line bg-surface text-muted hover:bg-surface-2"
      }`}
    >
      <span className={ativo ? "text-waz-30" : "text-muted"}>{icone}</span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{titulo}</span>
        <span className="block text-[11px] text-muted">{dica}</span>
      </span>
    </button>
  );
}
