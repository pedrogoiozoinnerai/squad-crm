"use client";

import { useActionState, useEffect, useState } from "react";

import { scheduleMeeting, type EstadoDaReuniao } from "@/app/actions/meetings";
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
};

const DURACOES = [15, 30, 45, 60, 90, 120];

/**
 * O formulário de marcar reunião — um só, para as cinco telas.
 *
 * Cliente, e não um `<form action>` servido direto, porque a lotação aparece e
 * some com a chave grupo/1:1 e o seletor de lead busca enquanto se digita. O
 * `<form>` por dentro continua sendo um form de verdade: sem JavaScript, o
 * POST ainda chega na Server Action.
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

  // Fecha sozinho quando deu certo — a menos que tenha vindo aviso de
  // conflito, que a pessoa precisa ler antes de a tela sumir.
  useEffect(() => {
    if (estado?.ok && !estado.aviso) aoConcluir?.();
  }, [estado, aoConcluir]);

  return (
    <form action={acao} className="flex flex-col gap-3">
      {padrao?.dealId && <input type="hidden" name="dealId" value={padrao.dealId} />}

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
        <Field label="Início">
          <input
            name="startsAt"
            type="datetime-local"
            defaultValue={padrao?.inicioEm}
            required
            className="field"
          />
        </Field>
        <Field label="Duração">
          <select name="duration" defaultValue={padrao?.duracaoMin ?? 30} className="field">
            {DURACOES.map((m) => (
              <option key={m} value={m}>
                {m < 60 ? `${m} min` : m === 60 ? "1 hora" : `${Math.floor(m / 60)}h${m % 60 ? String(m % 60).padStart(2, "0") : ""}`}
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

      <Retorno estado={estado} aoFechar={aoConcluir} />

      <SubmitRow>
        {aoConcluir && (
          <button type="button" onClick={aoConcluir} className="btn-ghost">
            Cancelar
          </button>
        )}
        <button type="submit" disabled={salvando} className="btn-primary">
          {salvando ? "Agendando…" : "Agendar"}
        </button>
      </SubmitRow>
    </form>
  );
}

/**
 * Erro em vermelho, conflito em âmbar.
 *
 * São coisas diferentes e não podem ter a mesma cor: o vermelho diz "não
 * aconteceu", o âmbar diz "aconteceu, e olha isto aqui". Pintar conflito de
 * vermelho faria a pessoa procurar uma reunião que já existe.
 */
function Retorno({ estado, aoFechar }: { estado: EstadoDaReuniao; aoFechar?: () => void }) {
  if (estado?.error) {
    return (
      <p role="alert" className="rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-700">
        {estado.error}
      </p>
    );
  }
  if (estado?.ok && estado.aviso) {
    return (
      <div className="rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
        <p className="font-medium">Reunião agendada — mas atenção ao horário.</p>
        <p className="mt-0.5">{estado.aviso}</p>
        {aoFechar && (
          <button type="button" onClick={aoFechar} className="mt-2 text-xs font-semibold underline">
            Entendi, fechar
          </button>
        )}
      </div>
    );
  }
  return null;
}
