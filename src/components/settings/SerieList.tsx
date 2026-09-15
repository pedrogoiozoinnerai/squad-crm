"use client";

import { useActionState, useState } from "react";
import { CalendarClock, Plus } from "lucide-react";

import { desativarSerie, salvarSerie } from "@/app/actions/sessoes";
import { Field, SubmitRow } from "@/components/ui/Field";
import { FormFeedback } from "@/components/ui/FormFeedback";
import type { FormState } from "@/lib/guard";

export type SerieRow = {
  id: string;
  name: string;
  weekdays: string;
  time: string;
  durationMin: number;
  capacity: number;
  active: boolean;
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

function porExtenso(weekdays: string) {
  const dias = weekdays.split(",").map(Number);
  return DIAS.filter((d) => dias.includes(d.n)).map((d) => d.curto).join(" · ") || "—";
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
            A série é a regra; as sessões da agenda nascem dela, com 28 dias de antecedência.
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

      {(aberto || emEdicao) && (
        <form action={acao} className="border-b border-line bg-surface-2/50 p-5">
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

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Field label="Horário" hint="No fuso de São Paulo">
              <input
                name="time"
                type="time"
                defaultValue={emEdicao?.time ?? "10:00"}
                required
                className="field"
              />
            </Field>
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
          </div>

          <FormFeedback state={estado} />
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
                  {porExtenso(s.weekdays)} · {s.time} · {s.durationMin} min · {s.capacity} vagas ·{" "}
                  {s.owner.name}
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

              <form action={desativarSerie}>
                <input type="hidden" name="id" value={s.id} />
                <button type="submit" className="btn-ghost px-3 py-1.5 text-xs">
                  {s.active ? "Desligar" : "Religar"}
                </button>
              </form>
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
