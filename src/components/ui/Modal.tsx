"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

/**
 * A janela que abre por cima da tela.
 *
 * Os dois modais de "Nova reunião" eram `<div className="fixed inset-0">` com
 * um `<button>` de tela cheia por trás para fechar no clique. Três problemas de
 * uma vez: nada dizia ao leitor de tela que aquilo era um diálogo, Esc não
 * fechava, e o foco continuava correndo a página inteira atrás — com o botão
 * invisível do fundo como PRIMEIRA parada do Tab, de modo que quem navega pelo
 * teclado começava em "Fechar" sem saber, e um Enter descuidado fechava tudo.
 *
 * O `<dialog>` nativo resolve os três sem código nosso: `showModal()` prende o
 * foco dentro e torna inerte o que está atrás. O que sobra aqui é costurar o
 * fechamento de volta ao React, que o navegador não faz sozinho.
 */
export function Modal({
  titulo,
  descricao,
  aoFechar,
  children,
}: {
  titulo: string;
  descricao?: ReactNode;
  aoFechar: () => void;
  children: ReactNode;
}) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const idDoTitulo = useId();

  useEffect(() => {
    const janela = dialogo.current;
    if (!janela || janela.open) return;
    janela.showModal();
    return () => janela.close();
  }, []);

  return (
    <dialog
      ref={dialogo}
      aria-labelledby={idDoTitulo}
      // Duas portas para a mesma saída, e a razão de serem duas é chata: o Esc
      // do `<dialog>` é um "close request" do navegador, e ele fecha o elemento
      // do DOM sem passar pelo React — o estado do componente continuaria
      // achando que está aberto, e a segunda abertura não aconteceria. Aqui o
      // Esc é interceptado antes disso e quem fecha é o React, sempre.
      onKeyDown={(evento) => {
        if (evento.key !== "Escape") return;
        evento.preventDefault();
        aoFechar();
      }}
      // E `onCancel` continua, para os pedidos de fechamento que não vêm do
      // teclado — o botão voltar de gesto, o Esc do sistema em tela cheia.
      onCancel={(evento) => {
        evento.preventDefault();
        aoFechar();
      }}
      // Clique no fundo. Não existe alvo para o `::backdrop`: o que chega é um
      // clique no próprio `<dialog>`, fora do cartão.
      onClick={(evento) => {
        if (evento.target === dialogo.current) aoFechar();
      }}
      className="fixed inset-0 z-50 m-0 h-dvh max-h-none w-screen max-w-none justify-center overflow-y-auto bg-transparent p-4 backdrop:bg-black/30 open:flex sm:p-8"
    >
      <div className="card h-fit w-full max-w-xl p-5 text-left">
        <header className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id={idDoTitulo} className="text-sm font-semibold">
              {titulo}
            </h2>
            {descricao && <p className="mt-0.5 text-xs text-muted">{descricao}</p>}
          </div>
          <button
            type="button"
            onClick={aoFechar}
            aria-label="Fechar"
            className="rounded-lg p-1 text-muted transition hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}
