"use client";

import { useCallback, useEffect, useState } from "react";
import { RoomEvent, Track, type Room } from "livekit-client";
import { MessageSquare, Users, X } from "lucide-react";

import { BarraDeControles } from "@/components/sala/BarraDeControles";
import { Conversa } from "@/components/sala/Conversa";
import { SeletorDeAparelho } from "@/components/sala/SeletorDeAparelho";
import { Participantes } from "@/components/sala/Participantes";
import { Quadro } from "@/components/sala/Quadro";
import { useConversa, type Credencial } from "@/components/sala/useConversa";
import { useSala } from "@/components/sala/useSala";

type Painel = "participantes" | "chat" | null;

export function Reuniao({
  sala,
  titulo,
  host,
  meetingId,
  credencial,
  aoSair,
}: {
  sala: Room;
  titulo: string;
  host: boolean;
  meetingId: string;
  credencial: Credencial;
  aoSair: () => void;
}) {
  const { eu, todos, falando } = useSala(sala);
  const [painel, setPainel] = useState<Painel>(null);
  const [seletor, setSeletor] = useState<MediaDeviceKind | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  // A conversa mora AQUI, e não dentro do painel, porque o painel só existe
  // enquanto está aberto: com o estado lá dentro, fechar o chat apagava a
  // conversa inteira e reabrir mostrava "Nenhuma mensagem". Era o bug.
  const conversa = useConversa(sala, credencial, painel === "chat");

  useEffect(() => {
    const desconectou = () => aoSair();
    sala.on(RoomEvent.Disconnected, desconectou);
    return () => {
      sala.off(RoomEvent.Disconnected, desconectou);
    };
  }, [sala, aoSair]);

  const proteger = useCallback(async (acao: () => Promise<unknown>, oQue: string) => {
    try {
      await acao();
      setAviso(null);
    } catch (erro) {
      // Falha no meio da call não pode ser silenciosa nem derrubar a chamada.
      setAviso(`Não foi possível ${oQue}. ${(erro as Error)?.message ?? ""}`.trim());
    }
  }, []);

  const mandarAoHost = useCallback(
    (acao: string, identidade?: string) =>
      proteger(async () => {
        const r = await fetch("/api/livekit/sala", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ meetingId, acao, identidade }),
        });
        if (!r.ok) throw new Error((await r.json()).erro ?? "recusado");
      }, descricaoDaAcao(acao)),
    [meetingId, proteger],
  );

  const microfoneLigado = eu?.isMicrophoneEnabled ?? false;
  const cameraLigada = eu?.isCameraEnabled ?? false;
  const compartilhando = Boolean(eu?.getTrackPublication(Track.Source.ScreenShare));
  const maoLevantada = eu?.attributes?.mao === "1";
  const travados = lerTrava(sala.metadata);
  const outros = todos.filter((p) => p.identity !== falando?.identity);

  if (!eu) return null;

  function abrirPainel(qual: Painel) {
    const abrindo = painel !== qual;
    setPainel(abrindo ? qual : null);
    // Aqui, e não num efeito que olha o painel: abrir o chat é um clique, e
    // zerar o contador a partir do estado encadearia uma renderização em cima
    // de outra por algo que já era sabido antes de renderizar.
    if (abrindo && qual === "chat") conversa.marcarLidas();
  }

  return (
    <div className="flex h-dvh flex-col bg-sala-fundo text-foreground">
      <header className="flex shrink-0 items-center gap-2.5 border-b border-sala-linha px-3 py-2.5 sm:gap-3 sm:px-5 sm:py-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/logo-black.svg"
          alt="Squad.com"
          // Era `h-4` — a marca ficava menor que o texto ao lado dela, que é o
          // contrário do que um manual de marca pede. E preto, não branco: o
          // arquivo branco sumia no fundo claro.
          className="h-6 w-auto shrink-0 sm:h-7"
        />
        <span className="hidden h-5 w-px shrink-0 bg-sala-linha sm:block" aria-hidden />
        <h1 className="hidden min-w-0 flex-1 truncate text-sm font-semibold sm:block">{titulo}</h1>
        {/* No celular o título some e sobra o espaço: com logo, título, relógio
            e duas abas na mesma linha, tudo fica ilegível numa tela de 375px. */}
        <span className="flex-1 sm:hidden" />

        {travados && !host && (
          <span className="hidden shrink-0 rounded-full bg-amber-50 px-3 py-1 text-xs text-amber-800 sm:block">
            Microfones travados pelo anfitrião
          </span>
        )}

        <Cronometro />

        <Aba
          ativa={painel === "participantes"}
          aoClicar={() => abrirPainel("participantes")}
          rotulo={`${todos.length}`}
          descricao={`${todos.length} ${todos.length === 1 ? "participante" : "participantes"}`}
        >
          <Users className="size-4" />
        </Aba>

        <Aba
          ativa={painel === "chat"}
          aoClicar={() => abrirPainel("chat")}
          rotulo="Chat"
          descricao="Chat"
          distintivo={conversa.naoLidas}
        >
          <MessageSquare className="size-4" />
        </Aba>
      </header>

      {aviso && (
        <p role="alert" className="mx-3 mt-2 rounded-xl bg-amber-50 px-4 py-2 text-sm text-amber-900 sm:mx-5">
          {aviso}
        </p>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-2 px-3 pb-24 sm:gap-3 sm:px-5 sm:pb-28 lg:flex-row">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 pt-2 sm:gap-3 sm:pt-3">
          <div className="min-h-0 flex-1">
            {falando && <Quadro participante={falando} grande souEu={falando.identity === eu.identity} />}
          </div>

          {/* No celular os outros viram uma fita que rola de lado embaixo do
              quadro principal. A coluna lateral de 200px, que era a única
              opção, ocupava metade da largura do aparelho. */}
          {outros.length > 0 && (
            <div className="flex shrink-0 gap-2 overflow-x-auto pb-1 lg:hidden">
              {outros.map((p) => (
                <div key={p.identity} className="w-[132px] shrink-0 sm:w-[168px]">
                  <Quadro participante={p} souEu={p.identity === eu.identity} />
                </div>
              ))}
            </div>
          )}
        </div>

        {outros.length > 0 && (
          <aside className="hidden w-[200px] shrink-0 space-y-3 overflow-y-auto pt-3 lg:block">
            {outros.map((p) => (
              <Quadro key={p.identity} participante={p} souEu={p.identity === eu.identity} />
            ))}
          </aside>
        )}

        {painel === "participantes" && (
          <PainelLateral
            titulo="Participantes"
            icone={<Users className="size-4" />}
            contagem={todos.length}
            aoFechar={() => setPainel(null)}
          >
            <Participantes
              todos={todos}
              eu={eu}
              host={host}
              aoSilenciar={(id) => void mandarAoHost("silenciar_todos", id)}
              aoRemover={(id) => void mandarAoHost("remover", id)}
            />
          </PainelLateral>
        )}

        {painel === "chat" && (
          <PainelLateral
            titulo="Chat"
            icone={<MessageSquare className="size-4" />}
            aoFechar={() => setPainel(null)}
          >
            <Conversa
              mensagens={conversa.mensagens}
              carregando={conversa.carregando}
              aoEnviar={conversa.enviar}
            />
          </PainelLateral>
        )}
      </div>

      <BarraDeControles
        host={host}
        seletorAberto={seletor}
        painelDeDispositivos={
          seletor && <SeletorDeAparelho sala={sala} tipo={seletor} aoFechar={() => setSeletor(null)} />
        }
        aoFecharSeletor={() => setSeletor(null)}
        estado={{
          microfone: microfoneLigado,
          camera: cameraLigada,
          compartilhando,
          maoLevantada,
          microfonesTravados: travados,
          gravando: false,
        }}
        acoes={{
          alternarMicrofone: () =>
            void proteger(
              () => eu.setMicrophoneEnabled(!microfoneLigado),
              microfoneLigado ? "silenciar o microfone" : "ativar o microfone",
            ),
          alternarCamera: () =>
            void proteger(
              () => eu.setCameraEnabled(!cameraLigada),
              cameraLigada ? "desligar a câmera" : "ativar a câmera",
            ),
          escolherMicrofone: () => setSeletor((s) => (s === "audioinput" ? null : "audioinput")),
          escolherCamera: () => setSeletor((s) => (s === "videoinput" ? null : "videoinput")),
          escolherSaida: () => setSeletor((s) => (s === "audiooutput" ? null : "audiooutput")),
          alternarTela: () =>
            void proteger(
              () => eu.setScreenShareEnabled(!compartilhando),
              compartilhando ? "parar de compartilhar" : "compartilhar a tela",
            ),
          // A mão vai nos atributos do participante: o LiveKit os replica para
          // todo mundo, então levantar a mão aparece na lista dos outros — que
          // é o ponto. Guardar em estado local só avisaria a mim mesmo.
          alternarMao: () =>
            void proteger(
              () => eu.setAttributes({ ...eu.attributes, mao: maoLevantada ? "" : "1" }),
              "levantar a mão",
            ),
          silenciarTodos: () => void mandarAoHost("silenciar_todos"),
          alternarTrava: () => void mandarAoHost(travados ? "destravar" : "travar"),
          encerrar: () => void mandarAoHost("encerrar"),
          sair: () => void sala.disconnect(),
        }}
      />
    </div>
  );
}

function descricaoDaAcao(acao: string) {
  return {
    silenciar_todos: "silenciar",
    travar: "travar os microfones",
    destravar: "liberar os microfones",
    remover: "remover o participante",
    encerrar: "encerrar a sessão",
  }[acao] ?? "executar a ação";
}

/** A sala guarda a trava no próprio metadado — quem entra depois já chega travado. */
function lerTrava(metadata: string | undefined) {
  if (!metadata) return false;
  try {
    return Boolean(JSON.parse(metadata)?.microfonesTravados);
  } catch {
    return false;
  }
}

/**
 * O painel lateral — que no celular é uma folha por cima da sala inteira.
 *
 * Uma coluna de 290px ao lado do vídeo funciona no monitor e é absurda num
 * aparelho de 375px: sobrava menos de um terço da tela para a call. No
 * telefone o painel cobre tudo e tem um X; a partir do `lg` volta a ser coluna.
 */
function PainelLateral({
  titulo,
  icone,
  contagem,
  aoFechar,
  children,
}: {
  titulo: string;
  icone: React.ReactNode;
  contagem?: number;
  aoFechar: () => void;
  children: React.ReactNode;
}) {
  return (
    <section
      className="fixed inset-0 z-30 flex flex-col bg-sala-superficie
                 lg:static lg:z-auto lg:my-3 lg:w-[300px] lg:shrink-0 lg:overflow-hidden lg:rounded-2xl lg:border lg:border-sala-linha"
      // A folha cobre a tela inteira no celular, inclusive a faixa do entalhe
      // e a do gesto de voltar: sem as duas margens, o título fica embaixo do
      // relógio do aparelho e o campo de texto embaixo da barra do sistema.
      style={{
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-sala-linha px-4 py-3.5 lg:border-b-0">
        <span className="text-muted">{icone}</span>
        <h2 className="flex-1 text-[11px] font-semibold tracking-[0.14em] uppercase">{titulo}</h2>
        {contagem !== undefined && (
          <span className="text-sm font-semibold text-muted tabular-nums">{contagem}</span>
        )}
        <button
          type="button"
          onClick={aoFechar}
          aria-label={`Fechar ${titulo.toLowerCase()}`}
          className="-mr-1.5 grid size-9 place-items-center rounded-lg text-muted transition hover:bg-surface-2 hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </header>
      {children}
    </section>
  );
}

function Aba({
  children,
  rotulo,
  descricao,
  ativa,
  aoClicar,
  distintivo,
}: {
  children: React.ReactNode;
  rotulo: string;
  descricao: string;
  ativa: boolean;
  aoClicar: () => void;
  distintivo?: number;
}) {
  return (
    <button
      type="button"
      onClick={aoClicar}
      aria-pressed={ativa}
      aria-label={descricao}
      title={descricao}
      className={`relative flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-2 text-sm transition sm:px-3 sm:py-1.5 ${
        // Ativo é PRETO sobre branco: numa sala clara, é o contraste que diz
        // qual aba está aberta sem precisar de cor nenhuma.
        ativa ? "bg-foreground text-background" : "hover:bg-surface-2"
      }`}
    >
      {children}
      {rotulo}
      {Boolean(distintivo) && (
        <span className="absolute -top-0.5 -right-0.5 grid min-w-5 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
          {distintivo}
        </span>
      )}
    </button>
  );
}

/**
 * O relógio da call.
 *
 * O instante inicial nasce DENTRO do efeito: lido na renderização (era
 * `useRef(Date.now())`), ele é uma função impura no corpo do componente — o
 * React avisa, e com razão: numa re-renderização inesperada o valor podia
 * mudar. Aqui o relógio começa uma vez, quando o componente monta.
 */
function Cronometro() {
  const [segundos, setSegundos] = useState(0);

  useEffect(() => {
    const inicio = Date.now();
    const id = setInterval(() => setSegundos(Math.round((Date.now() - inicio) / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  const dois = (n: number) => String(n).padStart(2, "0");
  const horas = Math.floor(segundos / 3600);

  return (
    <span className="shrink-0 font-mono text-xs text-muted tabular-nums sm:text-sm">
      {/* A hora só aparece quando existe: "00:" na frente rouba espaço da
          largura do celular durante a primeira hora de toda call. */}
      {horas > 0 && `${dois(horas)}:`}
      {dois(Math.floor((segundos % 3600) / 60))}:{dois(segundos % 60)}
    </span>
  );
}
