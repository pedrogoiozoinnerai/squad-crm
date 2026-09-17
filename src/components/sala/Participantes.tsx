"use client";

import { Track, type Participant } from "livekit-client";
import { Hand, MicOff, UserMinus, VideoOff } from "lucide-react";

import { iniciaisDe } from "@/components/sala/useSala";

/**
 * Quem está na sala.
 *
 * As ações de host aparecem por linha e não em massa: silenciar uma pessoa é
 * uma decisão sobre aquela pessoa. "Silenciar todos" existe na barra, onde já
 * está entre os controles que afetam a chamada inteira.
 */
export function Participantes({
  todos,
  eu,
  host,
  aoSilenciar,
  aoRemover,
}: {
  todos: Participant[];
  eu: Participant;
  host: boolean;
  aoSilenciar: (identidade: string) => void;
  aoRemover: (identidade: string) => void;
}) {
  return (
    <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-3">
      {todos.map((p) => {
        const microfone = p.getTrackPublication(Track.Source.Microphone);
        const camera = p.getTrackPublication(Track.Source.Camera);
        const mudo = !microfone || microfone.isMuted;
        const semCamera = !camera || camera.isMuted;
        const souEu = p.identity === eu.identity;
        const maoLevantada = p.attributes?.mao === "1";

        return (
          <li
            key={p.identity}
            className="flex items-center gap-2.5 rounded-xl px-2 py-2 transition hover:bg-surface-2"
          >
            <span
              className={`grid size-8 shrink-0 place-items-center rounded-full text-xs font-semibold transition ${
                p.isSpeaking
                  ? "bg-foreground text-background"
                  : "bg-surface-2 text-foreground"
              }`}
            >
              {iniciaisDe(p.name || p.identity)}
            </span>

            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm">
                {p.name || p.identity}
                {souEu && <span className="text-muted"> · você</span>}
              </span>
            </span>

            {maoLevantada && <Hand className="size-3.5 shrink-0" />}
            {semCamera && <VideoOff className="size-3.5 shrink-0 text-muted" />}
            {mudo && <MicOff className="size-3.5 shrink-0 text-red-600" />}

            {host && !souEu && (
              // Sempre visíveis no toque, e só no hover no mouse. Antes eram
              // `opacity-0 group-hover:opacity-100` sempre: num celular não
              // existe hover, então o host simplesmente não conseguia silenciar
              // nem remover ninguém — os botões estavam lá, invisíveis.
              <span className="flex shrink-0 items-center gap-0.5">
                <BotaoDeLinha
                  aoClicar={() => aoSilenciar(p.identity)}
                  desabilitado={mudo}
                  rotulo={mudo ? "Já está no mudo" : `Silenciar ${p.name || p.identity}`}
                >
                  <MicOff className="size-4" />
                </BotaoDeLinha>
                <BotaoDeLinha
                  aoClicar={() => aoRemover(p.identity)}
                  rotulo={`Remover ${p.name || p.identity} da sala`}
                  perigo
                >
                  <UserMinus className="size-4" />
                </BotaoDeLinha>
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function BotaoDeLinha({
  children,
  rotulo,
  aoClicar,
  desabilitado,
  perigo,
}: {
  children: React.ReactNode;
  rotulo: string;
  aoClicar: () => void;
  desabilitado?: boolean;
  perigo?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={aoClicar}
      disabled={desabilitado}
      title={rotulo}
      aria-label={rotulo}
      // `size-9`: alvo de toque. `size-7` passa despercebido no dedo.
      className={`grid size-9 place-items-center rounded-lg transition disabled:opacity-25 ${
        perigo ? "text-red-600 hover:bg-red-50" : "text-muted hover:bg-surface-2 hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
