"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, MessageSquare, SendHorizontal, ShoppingCart, X } from "lucide-react";

import { LIMITE_DO_ROTULO, LIMITE_DO_TEXTO, type Mensagem } from "@/lib/mensagens-da-sala";

/**
 * O painel do chat.
 *
 * Só desenha: as mensagens vivem em `useConversa`, um andar acima. É essa
 * separação que conserta o defeito antigo — aqui dentro, o estado morria toda
 * vez que o painel fechava, e reabrir mostrava "Nenhuma mensagem" depois de
 * uma conversa inteira.
 */
export function Conversa({
  mensagens,
  carregando,
  aoEnviar,
  aoOfertar,
  host,
}: {
  mensagens: Mensagem[];
  carregando: boolean;
  aoEnviar: (texto: string) => void;
  /// Só chega preenchido para o anfitrião.
  aoOfertar?: (rotulo: string, url: string) => void;
  host?: boolean;
}) {
  const [texto, setTexto] = useState("");
  const [ofertando, setOfertando] = useState(false);
  // O último link fica na mão: o closer manda a mesma oferta em sessões
  // seguidas, e pedir para colar de novo a cada uma é atrito na hora em que ele
  // menos pode parar.
  const [rotulo, setRotulo] = useState("Quero começar agora");
  const [url, setUrl] = useState("");
  const lista = useRef<HTMLDivElement>(null);
  const grudado = useRef(true);

  // Rola o CONTÊINER, não a página. `scrollIntoView` num painel que é folha
  // deslizante no celular arrasta a sala inteira junto.
  useEffect(() => {
    const caixa = lista.current;
    if (!caixa || !grudado.current) return;
    caixa.scrollTop = caixa.scrollHeight;
  }, [mensagens]);

  // Quem subiu para reler algo não é puxado de volta pela mensagem seguinte.
  function aoRolar() {
    const caixa = lista.current;
    if (!caixa) return;
    grudado.current = caixa.scrollHeight - caixa.scrollTop - caixa.clientHeight < 60;
  }

  function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    if (!texto.trim()) return;
    grudado.current = true;
    aoEnviar(texto);
    setTexto("");
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div
        ref={lista}
        onScroll={aoRolar}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4"
      >
        {mensagens.length === 0 ? (
          <div className="grid h-full place-items-center px-4 text-center">
            <div>
              <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-surface-2">
                <MessageSquare className="size-6 text-muted" />
              </span>
              <p className="mt-4 font-semibold">
                {carregando ? "Carregando a conversa…" : "Nenhuma mensagem"}
              </p>
              {!carregando && (
                <p className="mt-1 text-sm text-muted">
                  Envie uma mensagem para iniciar a conversa.
                </p>
              )}
            </div>
          </div>
        ) : (
          <ol className="space-y-3 py-1">
            {mensagens.map((m) => (
              <li key={m.id} className={m.aCaminho ? "opacity-60" : ""}>
                <p className="flex items-baseline gap-2">
                  <span className="truncate text-xs font-semibold">
                    {m.minha ? "Você" : m.autor}
                  </span>
                  <span className="shrink-0 text-[10px] text-muted tabular-nums">
                    {m.em.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </p>
                {/* `break-words`: um link colado sem espaço estoura a coluna.
                    `whitespace-pre-wrap`: quebra de linha digitada é intenção. */}
                {m.tipo === "OFERTA" && m.url ? (
                  // O botão que o closer manda no fim do pitch. Grande e com
                  // alvo de toque de verdade: quem clica está no celular,
                  // ouvindo, e tem alguns segundos de decisão.
                  <a
                    href={m.url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="mt-1.5 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-foreground px-4 text-[15px] font-semibold text-background transition hover:opacity-85"
                  >
                    <ShoppingCart className="size-4 shrink-0" />
                    <span className="truncate">{m.texto}</span>
                  </a>
                ) : (
                  <p className="mt-0.5 text-sm break-words whitespace-pre-wrap">{m.texto}</p>
                )}
                {m.naoGravada && (
                  <p className="mt-1 flex items-center gap-1.5 text-[11px] text-amber-700">
                    <AlertCircle className="size-3 shrink-0" />
                    Enviada, mas não guardada — some se você recarregar.
                  </p>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>

      {ofertando && aoOfertar && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!rotulo.trim() || !url.trim()) return;
            aoOfertar(rotulo, url);
            setOfertando(false);
          }}
          className="space-y-2 border-t border-sala-linha bg-surface-2 p-3"
        >
          <p className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.12em] text-muted uppercase">
            <ShoppingCart className="size-3.5" />
            Botão de compra
            <button
              type="button"
              onClick={() => setOfertando(false)}
              aria-label="Cancelar"
              className="ml-auto grid size-6 place-items-center rounded-md hover:bg-surface"
            >
              <X className="size-3.5" />
            </button>
          </p>
          <input
            value={rotulo}
            onChange={(e) => setRotulo(e.target.value)}
            placeholder="Texto do botão"
            maxLength={LIMITE_DO_ROTULO}
            aria-label="Texto do botão"
            className="w-full rounded-xl bg-surface px-3.5 py-2.5 text-base outline-none focus:ring-2 focus:ring-foreground/15 sm:text-sm"
          />
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Link do pagamento"
            inputMode="url"
            autoComplete="url"
            aria-label="Link do pagamento"
            className="w-full rounded-xl bg-surface px-3.5 py-2.5 text-base outline-none focus:ring-2 focus:ring-foreground/15 sm:text-sm"
          />
          <button
            type="submit"
            disabled={!rotulo.trim() || !url.trim()}
            className="w-full rounded-xl bg-foreground px-4 py-2.5 text-sm font-semibold text-background transition hover:opacity-85 disabled:opacity-30"
          >
            Enviar para a sala
          </button>
        </form>
      )}

      <form onSubmit={enviar} className="flex items-center gap-2 border-t border-sala-linha p-3">
        {host && aoOfertar && !ofertando && (
          <button
            type="button"
            onClick={() => setOfertando(true)}
            aria-label="Enviar botão de compra"
            title="Enviar botão de compra"
            className="grid size-11 shrink-0 place-items-center rounded-xl ring-1 ring-sala-linha transition hover:bg-surface-2"
          >
            <ShoppingCart className="size-4" />
          </button>
        )}
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Digite uma mensagem."
          maxLength={LIMITE_DO_TEXTO}
          aria-label="Mensagem"
          // `text-base` e não `text-sm`: abaixo de 16px o Safari do iPhone dá
          // zoom sozinho ao focar o campo, e a sala sai do lugar.
          className="min-w-0 flex-1 rounded-xl bg-surface-2 px-3.5 py-2.5 text-base outline-none placeholder:text-muted focus:ring-2 focus:ring-foreground/15 sm:text-sm"
        />
        <button
          type="submit"
          disabled={!texto.trim()}
          aria-label="Enviar"
          className="grid size-11 shrink-0 place-items-center rounded-xl bg-foreground text-background transition hover:opacity-85 disabled:opacity-25"
        >
          <SendHorizontal className="size-4" />
        </button>
      </form>
    </section>
  );
}
