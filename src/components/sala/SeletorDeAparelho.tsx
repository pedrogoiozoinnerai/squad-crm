"use client";

import { useCallback, useEffect, useState } from "react";
import { Check } from "lucide-react";
import type { Room } from "livekit-client";

import { aparelhosNaTela, type AparelhoNaTela } from "@/lib/aparelhos";

/**
 * Troca de câmera, microfone ou saída de áudio no meio da call.
 *
 * Precisa existir porque o fone de ouvido quase nunca está conectado quando a
 * antessala pergunta — ele entra em cima da hora, e até aqui a única saída era
 * sair e voltar.
 */
/**
 * É um celular?
 *
 * Por ponteiro grosso e toque, não por largura de tela: a janela estreita de um
 * navegador no computador não tem câmera traseira, e um tablet em paisagem tem.
 * `pointer: coarse` é o que separa dedo de mouse.
 */
function ehCelular(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(pointer: coarse)").matches;
}

export function SeletorDeAparelho({
  sala,
  tipo,
  aoFechar,
}: {
  sala: Room;
  tipo: MediaDeviceKind;
  aoFechar: () => void;
}) {
  const [lista, setLista] = useState<AparelhoNaTela[]>([]);
  const [atual, setAtual] = useState<string | undefined>(sala.getActiveDevice(tipo));
  const [trocando, setTrocando] = useState<string | null>(null);
  const [falha, setFalha] = useState<string | null>(null);

  const listar = useCallback(async () => {
    // `enumerateDevices` só devolve os RÓTULOS depois de alguma permissão
    // concedida — antes disso a lista vem com nomes vazios. Por isso a troca
    // fica aqui dentro, e não na antessala antes de pedir acesso.
    const todos = await navigator.mediaDevices.enumerateDevices();
    // A limpeza vive em `lib/aparelhos`, pura: um iPhone devolve seis câmeras
    // (frontal, traseira, grande-angular, teleobjetiva, dupla, tripla) e o
    // mesmo microfone três vezes. Nada disso é escolha que alguém queira fazer
    // no meio de uma apresentação.
    setLista(aparelhosNaTela(todos, tipo, ehCelular()));
  }, [tipo]);

  useEffect(() => {
    // O `setLista` acontece DEPOIS do await, não no corpo do efeito — mas a
    // regra não consegue enxergar através do `async`, e ler a lista de
    // aparelhos ao montar é exatamente o que um efeito serve para fazer.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void listar();

    // O fone conectado com o painel JÁ ABERTO não aparecia: a lista era lida
    // uma vez e nunca mais. É o caso mais comum de todos — a pessoa abre o
    // seletor porque não está se ouvindo, e só então liga o fone.
    const aparelhos = navigator.mediaDevices;
    aparelhos.addEventListener("devicechange", listar);
    return () => aparelhos.removeEventListener("devicechange", listar);
  }, [listar]);

  const titulo = {
    audioinput: "Microfone",
    videoinput: "Câmera",
    audiooutput: "Saída de áudio",
  }[tipo as string];

  async function trocar(deviceId: string) {
    setTrocando(deviceId);
    setFalha(null);
    try {
      await sala.switchActiveDevice(tipo, deviceId);
      setAtual(deviceId);
      aoFechar();
    } catch (erro) {
      // Trocar de aparelho falha de verdade: a câmera nova pode estar em uso
      // por outro programa. Fechar o painel em silêncio faria parecer que
      // funcionou, e a pessoa ficaria sem entender por que continua igual.
      console.error("[sala] troca de aparelho falhou:", erro);
      setFalha("Não foi possível usar este aparelho. Ele pode estar em uso por outro programa.");
    } finally {
      setTrocando(null);
    }
  }

  return (
    // Ancorado na base da tela, não no botão que o abriu.
    //
    // Enquanto era um balão `absolute` dentro do botão-seta, ele saía pela
    // lateral num aparelho de 375px — e, pior, simplesmente não aparecia quando
    // chamado pelo "⋯", porque o botão-seta está escondido no celular. Preso à
    // tela ele funciona nos dois tamanhos: largura cheia no telefone, 290px
    // centrado acima da barra no monitor.
    <div
      className="fixed inset-x-3 bottom-24 z-30 overflow-hidden rounded-2xl border border-sala-linha bg-sala-elevado shadow-xl
                 sm:inset-x-auto sm:left-1/2 sm:w-[290px] sm:-translate-x-1/2"
      role="dialog"
      aria-label={titulo}
    >
      <p className="px-4 pt-3 pb-2 text-[11px] font-semibold tracking-[0.12em] text-muted uppercase">
        {titulo}
      </p>

      {falha && (
        <p role="alert" className="mx-3 mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">
          {falha}
        </p>
      )}

      <ul className="max-h-[50vh] overflow-y-auto overscroll-contain pb-2 sm:max-h-64">
        {lista.length === 0 && (
          <li className="px-4 py-3 text-sm text-muted">Nenhum aparelho encontrado.</li>
        )}
        {lista.map((d) => (
          <li key={d.deviceId}>
            <button
              type="button"
              onClick={() => void trocar(d.deviceId)}
              disabled={trocando !== null}
              className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm transition hover:bg-surface-2 disabled:opacity-50 sm:py-2.5"
            >
              <span className="w-4 shrink-0">
                {d.deviceId === atual && <Check className="size-4" />}
              </span>
              <span className="min-w-0 flex-1 truncate">{d.nome}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
