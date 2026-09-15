"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RoomEvent, Track, type Room } from "livekit-client";
import { Users } from "lucide-react";

import { BarraDeControles } from "@/components/sala/BarraDeControles";
import { Coach, type BlocoDoRoteiro } from "@/components/sala/Coach";
import { Quadro } from "@/components/sala/Quadro";
import { useSala } from "@/components/sala/useSala";

/** A chamada em si. */
export function Reuniao({
  sala,
  titulo,
  host,
  aoSair,
  meetingId,
  roteiro,
  marcados,
}: {
  sala: Room;
  titulo: string;
  host: boolean;
  aoSair: () => void;
  meetingId: string;
  roteiro: BlocoDoRoteiro[];
  marcados: Record<string, number>;
}) {
  const { eu, todos, falando } = useSala(sala);
  const [maoLevantada, setMaoLevantada] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  // O instante em que a call começou, não um contador em estado: assim o
  // relógio corre dentro do próprio <Cronometro/> e a reunião inteira não
  // redesenha a cada segundo — com o vendedor clicando no roteiro no meio.
  const inicio = useRef(Date.now());
  const segundoAtual = useCallback(
    () => Math.round((Date.now() - inicio.current) / 1000),
    [],
  );

  // Sair pela sala (host encerrou, queda definitiva) leva ao mesmo lugar que o
  // botão: sem isto o participante fica olhando uma tela congelada.
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
      // Falha de dispositivo no meio da call não pode ser silenciosa nem
      // derrubar a chamada — vira um aviso e a conversa continua.
      setAviso(`Não foi possível ${oQue}. ${(erro as Error)?.message ?? ""}`.trim());
    }
  }, []);

  if (!eu) return null;

  const microfoneLigado = eu.isMicrophoneEnabled;
  const cameraLigada = eu.isCameraEnabled;
  const compartilhando = Boolean(eu.getTrackPublication(Track.Source.ScreenShare));
  const outros = todos.filter((p) => p.identity !== falando?.identity);

  return (
    <div className="flex h-dvh flex-col bg-[#0d1424] text-white">
      <header className="flex shrink-0 items-center gap-4 px-5 py-3">
        <h1 className="min-w-0 flex-1 truncate text-sm font-semibold">{titulo}</h1>
        <Cronometro desde={inicio} />
        <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-sm">
          <Users className="size-4" />
          {todos.length} {todos.length === 1 ? "participante" : "participantes"}
        </span>
      </header>

      {aviso && (
        <p role="alert" className="mx-5 mb-2 rounded-xl bg-amber-500/15 px-4 py-2 text-sm text-amber-200">
          {aviso}
        </p>
      )}

      <div className="flex min-h-0 flex-1 gap-3 px-5 pb-28">
        {host && roteiro.length > 0 && (
          <Coach
            meetingId={meetingId}
            blocos={roteiro}
            marcados={marcados}
            segundoAtual={segundoAtual}
          />
        )}

        <div className="min-w-0 flex-1">
          {falando && <Quadro participante={falando} grande souEu={falando.identity === eu.identity} />}
        </div>

        {outros.length > 0 && (
          <aside className="w-[220px] shrink-0 space-y-3 overflow-y-auto">
            {outros.map((p) => (
              <Quadro key={p.identity} participante={p} souEu={p.identity === eu.identity} />
            ))}
          </aside>
        )}
      </div>

      <BarraDeControles
        host={host}
        estado={{
          microfone: microfoneLigado,
          camera: cameraLigada,
          compartilhando,
          maoLevantada,
          microfonesTravados: false,
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
          escolherMicrofone: () => setAviso("A troca de dispositivo entra no próximo passo."),
          escolherCamera: () => setAviso("A troca de dispositivo entra no próximo passo."),
          escolherSaida: () => setAviso("A troca de dispositivo entra no próximo passo."),
          alternarTela: () =>
            void proteger(
              () => eu.setScreenShareEnabled(!compartilhando),
              compartilhando ? "parar de compartilhar" : "compartilhar a tela",
            ),
          alternarMao: () => setMaoLevantada((m) => !m),
          silenciarTodos: () => setAviso("Silenciar todos entra junto com os controles de host."),
          alternarTrava: () => setAviso("Travar microfones entra junto com os controles de host."),
          encerrar: () => setAviso("Encerrar a sessão entra junto com a gravação."),
          sair: () => void sala.disconnect(),
        }}
      />
    </div>
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
