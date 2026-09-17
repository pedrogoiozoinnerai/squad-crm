"use client";

import { useActionState, useState } from "react";
import { CalendarClock, Plus } from "lucide-react";

import { desativarSerie, salvarSerie } from "@/app/actions/sessoes";
import { Field, SubmitRow } from "@/components/ui/Field";
import { FormFeedback } from "@/components/ui/FormFeedback";
import { Acao } from "@/components/ui/Acao";
import type { FormState } from "@/lib/guard";

export type SerieRow = {
  id: string;
  name: string;
  weekdays: string;
  times: string;
  durationMin: number;
  capacity: number;
  active: boolean;
  horizonte: "FIM_DO_MES" | "DIAS";
  horizonDias: number;
  owner: { id: string; name: string };
  _count: { meetings: number };
};

const DIAS = [
  { n: 1, curto: "Seg" },
  { n: 2, curto: "Ter" },
  { n: 3, curto: "Qua" },
  { n: 4, curto: "Qui" },
  { n: 5, curto: "Sex" },
  { n: 6, curto: "Sáb" },
  { n: 7, curto: "Dom" },
];

/// As 24 horas cheias. A grade é de hora em hora porque é assim que a agenda
/// do funil abre; meia hora exigiria 48 caixas e ninguém pediu.
const HORAS = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, "0")}:00`);

/// O atalho que resolve o caso real de um clique: 08:00 às 20:00.
const COMERCIAL = HORAS.slice(8, 21);

function porExtenso(weekdays: string) {
  const dias = weekdays.split(",").map(Number);
  return DIAS.filter((d) => dias.includes(d.n)).map((d) => d.curto).join(" · ") || "—";
}

/**
 * Treze horários não cabem na linha de resumo.
 *
 * Com um ou dois, o valor é a informação. A partir daí o que importa é quantos
 * são e onde começam e terminam.
 */
function resumoDeHorarios(times: string) {
  const lista = times.split(",").map((t) => t.trim()).filter(Boolean);
  if (lista.length === 0) return "—";
  if (lista.length <= 2) return lista.join(" e ");
  return `${lista.length} horários · ${lista[0]}–${lista[lista.length - 1]}`;
}

/**
 * As séries recorrentes — "toda terça às 10h".
 *
 * A tela de sessões nascia vazia porque não havia como criar uma série: o
 * modelo existia, o materializador não, e nenhuma tela escrevia. Aqui é onde a
 * grade da semana passa a existir.
 */
export function SerieList({
  series,
  owners,
}: {
  series: SerieRow[];
  owners: { id: string; name: string }[];
}) {
  const [aberto, setAberto] = useState(false);
  const [editando, setEditando] = useState<SerieRow | null>(null);
  const [estado, acao, salvando] = useActionState<FormState, FormData>(salvarSerie, null);

  const emEdicao = editando ?? null;

  return (
    <section className="card overflow-hidden">
      <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold">Sessões recorrentes</h2>
          <p className="mt-0.5 text-sm text-muted">
            A série é a regra; as sessões da agenda nascem dela e vão até o fim do mês.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setEditando(null);
            setAberto((a) => !a);
          }}
          className="btn-primary shrink-0"
        >
          <Plus className="size-4" />
          Nova série
        </button>
      </header>

      {/* O `key` do formulário remonta ao trocar de série.
          Sem ele, os `<select defaultValue>` de dono, duração e horizonte só
          eram aplicados na primeira montagem: abrir "Editar" na série A e
          depois na B mostrava os dados de A com o id de B — e Salvar gravava
          A por cima de B. */}
      {(aberto || emEdicao) && (
        <form
          key={emEdicao?.id ?? "nova"}
          action={acao}
          className="border-b border-line bg-surface-2/50 p-5"
        >
          {emEdicao && <input type="hidden" name="id" value={emEdicao.id} />}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome da série">
              <input name="name" defaultValue={emEdicao?.name} required className="field" />
            </Field>
            <Field label="Quem conduz">
              <select name="ownerId" defaultValue={emEdicao?.owner.id} className="field" required>
                {owners.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <fieldset className="mt-4">
            <legend className="mb-1.5 text-xs font-semibold text-muted">Dias da semana</legend>
            <div className="flex flex-wrap gap-1.5">
              {DIAS.map((d) => (
                <label key={d.n} className="cursor-pointer">
                  <input
                    type="checkbox"
                    name="weekdays"
                    value={d.n}
                    defaultChecked={emEdicao?.weekdays.split(",").includes(String(d.n))}
                    className="peer sr-only"
                  />
                  <span className="chip border border-line bg-surface text-muted transition peer-checked:border-waz-50 peer-checked:bg-waz-95 peer-checked:text-waz-20 peer-focus-visible:ring-4 peer-focus-visible:ring-waz-90">
                    {d.curto}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <GradeDeHorarios key={emEdicao?.id ?? "nova"} inicial={emEdicao?.times ?? "10:00"} />

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Field label="Duração">
              <select name="durationMin" defaultValue={emEdicao?.durationMin ?? 45} className="field">
                {[30, 45, 60, 90, 120].map((m) => (
                  <option key={m} value={m}>
                    {m} minutos
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Lotação" hint="Vagas por sessão">
              <input
                name="capacity"
                type="number"
                min={1}
                max={500}
                defaultValue={emEdicao?.capacity ?? 20}
                required
                className="field"
              />
            </Field>
            <Field label="Até quando encher" hint="O que o funil mostra">
              <select
                name="horizonte"
                defaultValue={emEdicao?.horizonte ?? "FIM_DO_MES"}
                className="field"
              >
                <option value="FIM_DO_MES">Até o fim do mês</option>
                <option value="DIAS">Um número fixo de dias</option>
              </select>
            </Field>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Field label="Dias à frente" hint='Só vale em "número fixo de dias"'>
              <input
                name="horizonDias"
                type="number"
                min={1}
                max={90}
                defaultValue={emEdicao?.horizonDias ?? 28}
                className="field"
              />
            </Field>
            <Field label="Começa em" hint="Opcional">
              <input name="startsOn" type="date" className="field" />
            </Field>
            <Field label="Termina em" hint="Opcional">
              <input name="endsOn" type="date" className="field" />
            </Field>
          </div>

          <FormFeedback state={estado} sucesso="Série salva." />
          <SubmitRow>
            <button
              type="button"
              onClick={() => {
                setAberto(false);
                setEditando(null);
              }}
              className="btn-ghost"
            >
              Cancelar
            </button>
            <button type="submit" disabled={salvando} className="btn-primary">
              {salvando ? "Salvando…" : emEdicao ? "Salvar série" : "Criar série"}
            </button>
          </SubmitRow>
        </form>
      )}

      {series.length === 0 ? (
        <p className="px-5 py-12 text-center text-sm text-muted">
          Nenhuma série ainda — e é por isso que a tela de sessões está vazia.
          <br />
          Crie uma para a agenda começar a se preencher sozinha.
        </p>
      ) : (
        <ul>
          {series.map((s) => (
            <li
              key={s.id}
              className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3.5 last:border-b-0"
            >
              <CalendarClock className="size-4 shrink-0 text-muted" />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">
                  {s.name}
                  {!s.active && <span className="ml-2 chip bg-surface-2 text-muted">desligada</span>}
                </span>
                <span className="block text-sm text-muted">
                  {porExtenso(s.weekdays)} · {resumoDeHorarios(s.times)} · {s.durationMin} min ·{" "}
                  {s.capacity} vagas · {s.owner.name}
                </span>
              </span>

              <span className="shrink-0 text-sm text-muted tabular-nums">
                {s._count.meetings} {s._count.meetings === 1 ? "sessão" : "sessões"}
              </span>

              <button
                type="button"
                onClick={() => {
                  setEditando(s);
                  setAberto(false);
                }}
                className="btn-ghost px-3 py-1.5 text-xs"
              >
                Editar
              </button>

              <Acao action={desativarSerie} mensagem="Não deu para desativar a série.">
                <input type="hidden" name="id" value={s.id} />
                <button type="submit" className="btn-ghost px-3 py-1.5 text-xs">
                  {s.active ? "Desligar" : "Religar"}
                </button>
              </Acao>
            </li>
          ))}
        </ul>
      )}

      <p className="border-t border-line px-5 py-3 text-xs text-muted">
        Desligar uma série para de criar sessões novas. As que já estão na agenda continuam —
        cancelar uma sessão marcada é decisão de cada sessão, não da série.
      </p>
    </section>
  );
}

/**
 * Os horários do dia, um por hora.
 *
 * Estado controlado, e não `defaultChecked`, por causa dos atalhos: marcar as
 * treze caixas de 08:00 a 20:00 no clique é o caso real desta tela, e um campo
 * não controlado não pode ser mexido de fora.
 */
function GradeDeHorarios({ inicial }: { inicial: string }) {
  const [marcados, setMarcados] = useState<string[]>(() =>
    inicial.split(",").map((t) => t.trim()).filter(Boolean),
  );

  const alternar = (hora: string) =>
    setMarcados((atual) =>
      atual.includes(hora) ? atual.filter((h) => h !== hora) : [...atual, hora].sort(),
    );

  return (
    <fieldset className="mt-4">
      <legend className="mb-1.5 text-xs font-semibold text-muted">
        Horários de cada dia
      </legend>

      <div className="mb-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setMarcados(COMERCIAL)}
          className="chip border border-line bg-surface text-muted transition hover:text-foreground"
        >
          08h–20h, de hora em hora
        </button>
        <button
          type="button"
          onClick={() => setMarcados([])}
          className="chip border border-line bg-surface text-muted transition hover:text-foreground"
        >
          Limpar
        </button>
        <span className="text-xs text-muted">
          {marcados.length === 0
            ? "nenhum horário"
            : `${marcados.length} ${marcados.length === 1 ? "horário" : "horários"} por dia`}
        </span>
      </div>

      <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6 lg:grid-cols-8">
        {HORAS.map((hora) => {
          const ligado = marcados.includes(hora);
          return (
            <label key={hora} className="cursor-pointer">
              {/* O valor só vai no POST quando marcado — é o que `getAll`
                  recolhe do outro lado. */}
              {ligado && <input type="hidden" name="times" value={hora} />}
              <input
                type="checkbox"
                checked={ligado}
                onChange={() => alternar(hora)}
                className="peer sr-only"
              />
              <span
                className={`block rounded-lg border px-2 py-1.5 text-center font-mono text-xs transition peer-focus-visible:ring-4 peer-focus-visible:ring-waz-90 ${
                  ligado
                    ? "border-waz-50 bg-waz-95 text-waz-20"
                    : "border-line bg-surface text-muted hover:text-foreground"
                }`}
              >
                {hora}
              </span>
            </label>
          );
        })}
      </div>

      <p className="mt-2 text-[11px] text-muted">
        No fuso de São Paulo. Cada horário marcado vira uma sessão em cada dia da semana
        escolhido acima.
      </p>
    </fieldset>
  );
}
