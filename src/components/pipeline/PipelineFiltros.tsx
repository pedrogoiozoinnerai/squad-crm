"use client";

import { useRef } from "react";
import Link from "next/link";
import { Search, X } from "lucide-react";

/// Os mesmos valores que `recorteDePrazo` entende no servidor. Sair daqui
/// sem mexer lá vira um filtro que não filtra nada — em silêncio.
const PRAZOS = [
  { valor: "", rotulo: "Todos" },
  { valor: "atrasados", rotulo: "Atrasadas" },
  { valor: "hoje", rotulo: "Até hoje" },
  { valor: "semana", rotulo: "7 dias" },
  { valor: "sem-tarefa", rotulo: "Sem próximo passo" },
];

const ORDENS = [
  { valor: "recente", rotulo: "Mais recentes" },
  { valor: "valor", rotulo: "Maior valor" },
  { valor: "prazo", rotulo: "Previsão mais próxima" },
  { valor: "parado", rotulo: "Parados há mais tempo" },
];

export function PipelineFiltros({
  basePath,
  q,
  prazo,
  ordem,
  closer,
  owners,
}: {
  basePath: string;
  q: string;
  prazo: string;
  ordem: string;
  closer: string;
  /// Vazio para vendedor: ele só enxerga os próprios negócios, e um seletor
  /// de closer que não muda nada é um controle mentiroso.
  owners: { id: string; name: string }[];
}) {
  const form = useRef<HTMLFormElement>(null);
  const filtrando = Boolean(q || prazo || closer || (ordem && ordem !== "recente"));

  // Mexer num seletor já aplica. O campo de texto continua no Enter, que é o
  // que o teclado espera de um formulário.
  const aplicar = () => form.current?.requestSubmit();

  return (
    <form
      ref={form}
      method="get"
      action={basePath}
      className="card mb-5 flex flex-wrap items-center gap-x-3 gap-y-2 p-3"
    >
      <div className="relative min-w-[200px] flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
        <input
          name="q"
          defaultValue={q}
          placeholder="Buscar por nome, empresa, e-mail ou telefone…"
          aria-label="Buscar no pipeline"
          className="field pl-9"
        />
      </div>

      <fieldset className="flex flex-wrap items-center gap-1.5">
        <legend className="sr-only">Prazo das tarefas</legend>
        {PRAZOS.map((opcao) => (
          <label key={opcao.valor || "todos"} className="cursor-pointer">
            <input
              type="radio"
              name="prazo"
              value={opcao.valor}
              defaultChecked={prazo === opcao.valor}
              onChange={aplicar}
              className="peer sr-only"
            />
            <span className="chip border border-line bg-surface text-muted transition hover:text-foreground peer-checked:border-waz-50 peer-checked:bg-waz-95 peer-checked:text-waz-20 peer-focus-visible:ring-4 peer-focus-visible:ring-waz-90">
              {opcao.rotulo}
            </span>
          </label>
        ))}
      </fieldset>

      {owners.length > 0 && (
        <select
          name="closer"
          defaultValue={closer}
          onChange={aplicar}
          aria-label="Closer"
          className="field w-auto"
        >
          <option value="">Todos os closers</option>
          {owners.map((owner) => (
            <option key={owner.id} value={owner.id}>
              {owner.name}
            </option>
          ))}
        </select>
      )}

      <select
        name="ordem"
        defaultValue={ordem || "recente"}
        onChange={aplicar}
        aria-label="Ordenar por"
        className="field w-auto"
      >
        {ORDENS.map((opcao) => (
          <option key={opcao.valor} value={opcao.valor}>
            {opcao.rotulo}
          </option>
        ))}
      </select>

      {/* Sem JS o botão é a única forma de aplicar; com JS ele continua sendo
          o caminho do Enter no campo de busca. */}
      <button type="submit" className="btn-primary">
        Buscar
      </button>

      {filtrando && (
        <Link href={basePath} className="btn-ghost">
          <X className="size-4" />
          Limpar
        </Link>
      )}
    </form>
  );
}
