"use client";

import { useState } from "react";
import { ArrowRight, Check, Copy, Link2, Radio, UserRound } from "lucide-react";

/**
 * O que aparece no instante seguinte a marcar a reunião: os links.
 *
 * O passo seguinte a marcar é sempre mandar o endereço para alguém. Fechar o
 * formulário e obrigar a procurar a reunião na agenda para copiar o link é um
 * caminho que ninguém percorre na hora — percorre depois, quando lembra, que
 * é tarde.
 *
 * São dois links e eles não são intercambiáveis. O da sala vale para qualquer
 * um; o convite é de UMA pessoa inscrita e identifica quem entrou. Mandar o
 * convite de um lead para outra pessoa faria a presença dela contar como a
 * dele — por isso cada um tem seu rótulo e sua explicação.
 */
export function ReuniaoCriada({
  criada,
  aviso,
  aoFechar,
}: {
  criada: {
    titulo: string;
    comecaEm: string;
    sala: string;
    link: string;
    convite: string | null;
    aberta: boolean;
  };
  aviso?: string;
  aoFechar?: () => void;
}) {
  const quando = new Date(criada.comecaEm).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-start gap-3 rounded-2xl border border-waz-80 bg-waz-95 px-4 py-3">
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-waz-30 text-white">
          <Check className="size-4" />
        </span>
        <span className="min-w-0">
          <p className="text-sm font-semibold text-waz-10">{criada.titulo}</p>
          <p className="mt-0.5 text-xs text-waz-20 capitalize">{quando}</p>
        </span>
        {criada.aberta && (
          <span className="chip ml-auto shrink-0 bg-waz-30 text-white">
            <Radio className="size-3" />
            Sala aberta
          </span>
        )}
      </header>

      {aviso && (
        <p className="rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-900">{aviso}</p>
      )}

      <LinkCopiavel
        icone={<Link2 className="size-4" />}
        rotulo="Link da reunião"
        dica="Mande para qualquer pessoa. Quem abrir diz o nome e entra como convidado."
        url={criada.link}
        destaque
      />

      {criada.convite && (
        <LinkCopiavel
          icone={<UserRound className="size-4" />}
          rotulo="Convite do lead"
          dica="Pessoal e identificado: é este que faz a presença dele contar no negócio."
          url={criada.convite}
        />
      )}

      <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
        {aoFechar && (
          <button type="button" onClick={aoFechar} className="btn-ghost">
            Fechar
          </button>
        )}
        <a href={criada.sala} className="btn-primary">
          {criada.aberta ? "Entrar agora" : "Abrir a sala"}
          <ArrowRight className="size-4" />
        </a>
      </div>
    </div>
  );
}

function LinkCopiavel({
  icone,
  rotulo,
  dica,
  url,
  destaque,
}: {
  icone: React.ReactNode;
  rotulo: string;
  dica: string;
  url: string;
  destaque?: boolean;
}) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Área de transferência negada (permissão, http sem TLS): mostrar o
      // endereço é melhor que um botão que não faz nada.
      window.prompt("Copie o link:", url);
    }
  }

  return (
    <div
      className={`rounded-2xl border px-4 py-3 ${
        destaque ? "border-waz-70 bg-waz-95/50" : "border-line bg-surface-2/50"
      }`}
    >
      <p className="flex items-center gap-2 text-xs font-semibold text-muted">
        <span className={destaque ? "text-waz-30" : "text-muted"}>{icone}</span>
        {rotulo}
      </p>

      <div className="mt-2 flex items-center gap-2">
        {/* Somente leitura e não um `<p>`: dá para selecionar com o teclado,
            rola quando não cabe, e não some num truncate silencioso. */}
        <input
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          className="field flex-1 font-mono text-xs"
          aria-label={rotulo}
        />
        <button
          type="button"
          onClick={() => void copiar()}
          className="btn-ghost shrink-0 px-3"
          aria-live="polite"
        >
          {copiado ? (
            <>
              <Check className="size-3.5 text-waz-30" />
              Copiado
            </>
          ) : (
            <>
              <Copy className="size-3.5" />
              Copiar
            </>
          )}
        </button>
      </div>

      <p className="mt-1.5 text-[11px] leading-relaxed text-muted">{dica}</p>
    </div>
  );
}
