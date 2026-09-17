"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RoomEvent, type Participant, type Room } from "livekit-client";

import {
  confirmar,
  juntar,
  lerEnvelope,
  marcarNaoGravada,
  saneiaMensagem,
  type Mensagem,
} from "@/lib/mensagens-da-sala";

/**
 * O chat da chamada — a conversa inteira, viva enquanto a sala existir.
 *
 * Mora AQUI e não dentro do painel por causa do defeito que ele tinha: o painel
 * só é montado quando está aberto, então fechar o chat desmontava o componente
 * e o `useState` das mensagens ia junto. Reabrir mostrava "Nenhuma mensagem"
 * depois de uma conversa inteira. Enquanto o estado morar no componente que
 * aparece e desaparece, ele vai morrer com ele — tirar daí é a correção, não
 * um detalhe de organização.
 *
 * Duas fontes, de propósito:
 *
 * - **o canal de dados do LiveKit** leva a mensagem aos outros na hora, sem
 *   passar por nós;
 * - **a nossa rota** guarda, para a conversa sobreviver ao recarregar e para
 *   quem entra no meio da sessão ver o que já foi dito.
 *
 * Nenhuma das duas substitui a outra. Se a gravação falhar, a mensagem já foi
 * entregue e continua na tela — marcada, porque não vai sobreviver.
 */

export type Credencial = {
  meetingId: string;
  /// Token do convite do lead inscrito.
  convite: string | null;
  /// Token do link da reunião.
  convidado: string | null;
  /// A identidade que o servidor devolveu ao emitir o token.
  identidade: string;
  /// Como a pessoa aparece na sala.
  ///
  /// Só tem uso na porta do LINK, e é indispensável ali: quem entra por ela não
  /// tem conta nem inscrição, então o nome que ela digitou é a ÚNICA fonte.
  /// Sem mandar de volta, a rota caía no padrão e toda mensagem do histórico
  /// ficava assinada "Convidado" — enquanto ao vivo aparecia o nome certo, o
  /// que é pior que os dois errados.
  nome: string;
};

const codificador = new TextEncoder();
const decodificador = new TextDecoder();

/**
 * Os parâmetros da credencial, do jeito que as duas rotas leem.
 *
 * Uma porta de cada vez, nunca as três juntas: `portaDoCorpo`, do outro lado,
 * escolhe por ordem de precedência, e mandar duas faria a rota decidir por nós.
 */
function corpoDaCredencial(c: Credencial): Record<string, string> {
  if (c.convite) return { convite: c.convite };
  if (c.convidado) return { convidado: c.convidado, identidade: c.identidade, nome: c.nome };
  return { meetingId: c.meetingId };
}

export type Conversa = {
  mensagens: Mensagem[];
  /// Quantas chegaram com o painel fechado.
  naoLidas: number;
  /// O histórico ainda está vindo.
  carregando: boolean;
  enviar: (texto: string) => void;
  marcarLidas: () => void;
};

export function useConversa(sala: Room, credencial: Credencial, painelAberto: boolean): Conversa {
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [naoLidas, setNaoLidas] = useState(0);
  const [carregando, setCarregando] = useState(true);

  // O painel numa ref, e não numa dependência: o ouvinte do canal de dados é
  // registrado uma vez só, e reassiná-lo a cada abrir e fechar do painel abre
  // uma janela em que nenhuma mensagem é ouvida.
  //
  // Zerar o contador NÃO acontece aqui: quem abre o painel é um clique, e
  // clique é evento. Fazer isso num efeito encadeia uma renderização em cima
  // de outra por um estado que já era conhecido antes de renderizar.
  const aberto = useRef(painelAberto);
  useEffect(() => {
    aberto.current = painelAberto;
  }, [painelAberto]);

  // ── O histórico ─────────────────────────────────────────────────────────
  useEffect(() => {
    const controle = new AbortController();
    const busca = new URLSearchParams(corpoDaCredencial(credencial));

    void (async () => {
      try {
        const r = await fetch(`/api/sala/mensagens?${busca}`, { signal: controle.signal });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const dados = await r.json();
        const minhaIdentidade: string = dados.identidade ?? credencial.identidade;

        const doBanco: Mensagem[] = (dados.mensagens ?? []).map(
          (m: { id: string; identidade: string; autor: string; texto: string; em: string }) => ({
            id: m.id,
            identidade: m.identidade,
            autor: m.autor,
            texto: m.texto,
            em: new Date(m.em),
            minha: m.identidade === minhaIdentidade,
          }),
        );

        // `juntar` e não `setMensagens(doBanco)`: entre pedir e receber, alguém
        // pode ter escrito — e essa frase já está na lista, vinda do canal.
        setMensagens((atuais) => juntar(atuais, doBanco));
      } catch (erro) {
        if (controle.signal.aborted) return;
        // Sem histórico a call continua: o canal de dados não depende disto, e
        // travar o chat inteiro porque o passado não carregou seria pior.
        console.error("[sala] histórico do chat não carregou:", erro);
      } finally {
        if (!controle.signal.aborted) setCarregando(false);
      }
    })();

    return () => controle.abort();
    // A credencial não muda durante a call.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── O que chega ao vivo ─────────────────────────────────────────────────
  useEffect(() => {
    const recebeu = (carga: Uint8Array, de?: Participant) => {
      let envelope;
      try {
        envelope = lerEnvelope(JSON.parse(decodificador.decode(carga)));
      } catch {
        // Carga que não é JSON — outro recurso do LiveKit. Silêncio.
        return;
      }
      if (!envelope) return;

      // O id vem de quem mandou + a hora: o mesmo pacote entregue duas vezes
      // (acontece em reconexão) não vira duas mensagens.
      const identidade = de?.identity ?? "?";
      const chegou: Mensagem = {
        id: `vivo:${identidade}:${envelope.texto.length}:${Date.now()}`,
        identidade,
        autor: de?.name || identidade || "Alguém",
        texto: envelope.texto,
        em: new Date(),
        minha: false,
      };

      setMensagens((atuais) => juntar(atuais, [chegou]));
      if (!aberto.current) setNaoLidas((n) => n + 1);
    };

    sala.on(RoomEvent.DataReceived, recebeu);
    return () => {
      sala.off(RoomEvent.DataReceived, recebeu);
    };
  }, [sala]);

  // ── Mandar ──────────────────────────────────────────────────────────────
  const enviar = useCallback(
    (bruto: string) => {
      const texto = saneiaMensagem(bruto);
      if (!texto) return;

      const idLocal = `local:${crypto.randomUUID()}`;
      setMensagens((atuais) =>
        juntar(atuais, [
          {
            id: idLocal,
            identidade: credencial.identidade,
            autor: sala.localParticipant.name || "Você",
            texto,
            em: new Date(),
            minha: true,
            aCaminho: true,
          },
        ]),
      );

      // Primeiro o canal: é o caminho que precisa ser instantâneo. `reliable`
      // porque uma frase não pode se perder por congestionamento, ao contrário
      // de um quadro de vídeo.
      void sala.localParticipant
        .publishData(codificador.encode(JSON.stringify({ tipo: "chat", texto })), {
          reliable: true,
        })
        .catch((erro) => console.error("[sala] mensagem não saiu pelo canal:", erro));

      // Depois a memória.
      void (async () => {
        try {
          const r = await fetch("/api/sala/mensagens", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ ...corpoDaCredencial(credencial), texto }),
          });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          const gravada = await r.json();
          setMensagens((atuais) => confirmar(atuais, idLocal, gravada));
        } catch (erro) {
          console.error("[sala] mensagem não foi gravada:", erro);
          setMensagens((atuais) => marcarNaoGravada(atuais, idLocal));
        }
      })();
    },
    [sala, credencial],
  );

  const marcarLidas = useCallback(() => setNaoLidas(0), []);

  return { mensagens, naoLidas, carregando, enviar, marcarLidas };
}
