"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RoomEvent, Track, type Room } from "livekit-client";
import { MessageSquare, Users } from "lucide-react";

import { BarraDeControles } from "@/components/sala/BarraDeControles";
import { Conversa } from "@/components/sala/Conversa";
import { SeletorDeAparelho } from "@/components/sala/SeletorDeAparelho";
import { Participantes } from "@/components/sala/Participantes";
import { Quadro } from "@/components/sala/Quadro";
import { useSala } from "@/components/sala/useSala";

type Painel = "participantes" | "chat" | null;

export function Reuniao({
  sala,
  titulo,
  host,
  meetingId,
  aoSair,
}: {
  sala: Room;
  titulo: string;
  host: boolean;
  meetingId: string;
  aoSair: () => void;
}) {
  const { eu, todos, falando } = useSala(sala);
  const [painel, setPainel] = useState<Painel>(null);
  const [seletor, setSeletor] = useState<MediaDeviceKind | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [naoLidas, setNaoLidas] = useState(0);

  // O instante em que a call começou: assim o relógio corre dentro do próprio
  // <Cronometro/> e a reunião inteira não redesenha a cada segundo.
  const inicio = useRef(Date.now());

  useEffect(() => {
    const desconectou = () => aoSair();
    sala.on(RoomEvent.Disconnected, desconectou);
    return () => {
      sala.off(RoomEvent.Disconnected, desconectou);
    };
  }, [sala, aoSair]);

  // Contador de não lidas: sem ele, mensagem que chega com o painel fechado
  // passa despercebida no meio de uma conversa por vídeo.
  useEffect(() => {
    const chegou = () => setNaoLidas((n) => (painel === "chat" ? 0 : n + 1));
    sala.on(RoomEvent.DataReceived, chegou);
    return () => {
      sala.off(RoomEvent.DataReceived, chegou);
    };
  }, [sala, painel]);

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

  if (!eu) return null;

  const microfoneLigado = eu.isMicrophoneEnabled;
  const cameraLigada = eu.isCameraEnabled;
  const compartilhando = Boolean(eu.getTrackPublication(Track.Source.ScreenShare));
  const maoLevantada = eu.attributes?.mao === "1";
  const travados = lerTrava(sala.metadata);
  const outros = todos.filter((p) => p.identity !== falando?.identity);

  function abrirPainel(qual: Painel) {
    setPainel((atual) => (atual === qual ? null : qual));
    if (qual === "chat") setNaoLidas(0);
  }

  return (
    <div className="flex h-dvh flex-col bg-sala-fundo text-white">
      <header className="flex shrink-0 items-center gap-3 px-5 py-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/logo-white.svg" alt="Squad.com" className="h-4 w-auto shrink-0 opacity-90" />
        <span className="h-4 w-px shrink-0 bg-white/15" aria-hidden />
        <h1 className="min-w-0 flex-1 truncate text-sm font-semibold">{titulo}</h1>

        {travados && !host && (
          <span className="shrink-0 rounded-full bg-amber-500/15 px-3 py-1 text-xs text-amber-200">
            Microfones travados pelo anfitrião
          </span>
        )}

        <Cronometro desde={inicio} />

        <Aba
          ativa={painel === "participantes"}
          aoClicar={() => abrirPainel("participantes")}
          rotulo={`${todos.length} ${todos.length === 1 ? "participante" : "participantes"}`}
        >
          <Users className="size-4" />
        </Aba>

        <Aba ativa={painel === "chat"} aoClicar={() => abrirPainel("chat")} rotulo="Chat" distintivo={naoLidas}>
          <MessageSquare className="size-4" />
        </Aba>
      </header>

      {aviso && (
        <p role="alert" className="mx-5 mb-2 rounded-xl bg-amber-500/15 px-4 py-2 text-sm text-amber-200">
          {aviso}
        </p>
      )}

      <div className="flex min-h-0 flex-1 gap-3 px-5 pb-28">
        <div className="min-w-0 flex-1">
          {falando && <Quadro participante={falando} grande souEu={falando.identity === eu.identity} />}
        </div>

        {outros.length > 0 && (
          <aside className="hidden w-[200px] shrink-0 space-y-3 overflow-y-auto lg:block">
            {outros.map((p) => (
              <Quadro key={p.identity} participante={p} souEu={p.identity === eu.identity} />
            ))}
          </aside>
        )}

        {painel === "participantes" && (
          <Participantes
            todos={todos}
            eu={eu}
            host={host}
            aoSilenciar={(id) => void mandarAoHost("silenciar_todos", id)}
            aoRemover={(id) => void mandarAoHost("remover", id)}
          />
        )}

        {painel === "chat" && <Conversa sala={sala} />}
      </div>

      <BarraDeControles
        host={host}
        seletorAberto={seletor}
        painelDeDispositivos={
          seletor && <SeletorDeAparelho sala={sala} tipo={seletor} aoFechar={() => setSeletor(null)} />
        }
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

function Aba({
  children,
  rotulo,
  ativa,
  aoClicar,
  distintivo,
}: {
  children: React.ReactNode;
  rotulo: string;
  ativa: boolean;
  aoClicar: () => void;
  distintivo?: number;
}) {
  return (
    <button
      type="button"
      onClick={aoClicar}
      aria-pressed={ativa}
      className={`relative flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition ${
        ativa
          // Ativo é VERDE, não cinza: é o que diz que a tela é da Squad e
          // não de um player de vídeo qualquer. O cinza neutro servia para
          // qualquer marca — que é o problema.
          ? "bg-waz-50/20 text-waz-80"
          : "bg-white/5 text-white/70 hover:bg-white/10"
      }`}
    >
      {children}
      {rotulo}
      {Boolean(distintivo) && (
        <span className="absolute -top-1 -right-1 grid min-w-5 place-items-center rounded-full bg-waz-40 px-1 text-[10px] font-bold text-white">
          {distintivo}
        </span>
      )}
    </button>
  );
}

/** O relógio da call, com o estado que pisca fechado aqui dentro. */
function Cronometro({ desde }: { desde: React.RefObject<number> }) {
  const [segundos, setSegundos] = useState(0);

  useEffect(() => {
    const tique = () => setSegundos(Math.round((Date.now() - desde.current) / 1000));
    tique();
    const id = setInterval(tique, 1000);
    return () => clearInterval(id);
  }, [desde]);

  const dois = (n: number) => String(n).padStart(2, "0");
  return (
    <span className="shrink-0 font-mono text-sm text-white/60 tabular-nums">
      {dois(Math.floor(segundos / 3600))}:{dois(Math.floor((segundos % 3600) / 60))}:
      {dois(segundos % 60)}
    </span>
  );
}
