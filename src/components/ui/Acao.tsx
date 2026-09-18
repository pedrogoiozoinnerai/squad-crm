"use client";

import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { AlertCircle, X } from "lucide-react";

/**
 * Um `<form>` ligado direto a uma Server Action — sem levar a tela junto quando
 * ela falha.
 *
 * `<form action={acaoDoServidor}>` é o atalho natural para um botão de linha de
 * tabela, e tem um defeito caro: se a action lança — sessão expirada, registro
 * que sumiu, banco fora do ar —, o erro sobe até `app/error.tsx` e a página
 * inteira vira "Algo quebrou nesta tela". Quem clicou em concluir uma tarefa
 * perde o filtro, a rolagem, a gaveta aberta e o lugar onde estava, por causa
 * de um clique num ícone.
 *
 * Aqui a falha fica onde nasceu: uma faixa no rodapé, e o resto da tela
 * intacto. O `router.refresh()` existe porque algumas dessas telas já se
 * mexeram de forma otimista antes da resposta — sem ele, a linha continuaria
 * marcada como concluída. É por isso também que a faixa não promete que nada
 * mudou: a action pode ter gravado e falhado depois. O que dá para garantir é
 * que a tela está mostrando o que o servidor tem.
 *
 * A frase vem de quem chama, e não do erro: em produção o Next troca a mensagem
 * do servidor por um digest, e o que sobra ("An error occurred…") não diz o que
 * deixou de acontecer.
 */
export function Acao({
  action,
  mensagem,
  className,
  children,
}: {
  action: (formData: FormData) => Promise<void>;
  /// O que NÃO aconteceu, na voz de quem clicou: "Não deu para concluir a tarefa."
  mensagem: string;
  className?: string;
  children: ReactNode;
}) {
  const [falha, setFalha] = useState(false);
  const router = useRouter();

  return (
    <>
      <form
        className={className}
        action={async (formData) => {
          setFalha(false);
          try {
            await action(formData);
          } catch (erro) {
            // `redirect()` e `notFound()` chegam aqui como exceção, mas são
            // controle de fluxo do próprio Next — engolir os dois transformaria
            // um "sair" bem-sucedido numa mensagem de erro.
            if (ehDoNext(erro)) throw erro;
            console.error("[acao]", erro);
            setFalha(true);
            router.refresh();
          }
        }}
      >
        {children}
      </form>
      {falha && <Faixa texto={mensagem} aoFechar={() => setFalha(false)} />}
    </>
  );
}

/** O digest que o Next usa para navegar por exceção. */
function ehDoNext(erro: unknown): boolean {
  const digest = (erro as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_");
}

/**
 * A faixa vai para o `body` por portal de propósito: estes formulários vivem
 * dentro de células de tabela e cabeçalhos com `overflow-hidden`, e um aviso
 * posicionado ali dentro seria cortado justamente quando precisa ser lido.
 */
function Faixa({ texto, aoFechar }: { texto: string; aoFechar: () => void }) {
  return createPortal(
    <div
      role="alert"
      className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-md items-start gap-2 rounded-xl bg-red-50 px-3.5 py-3 text-sm text-red-700 shadow-lg ring-1 ring-red-200"
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" />
      <span className="flex-1">
        {texto} A tela voltou para o que está gravado.
      </span>
      <button
        type="button"
        onClick={aoFechar}
        aria-label="Fechar aviso"
        className="-m-1 grid size-6 shrink-0 place-items-center rounded-md hover:bg-red-100"
      >
        <X className="size-3.5" />
      </button>
    </div>,
    document.body,
  );
}
