"use client";

import { Track, type Participant } from "livekit-client";
import { Hand, MicOff, UserMinus, Users, VideoOff } from "lucide-react";

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
    <section className="flex w-[260px] shrink-0 flex-col overflow-hidden rounded-2xl bg-[#131c33]">
      <header className="flex items-center gap-2 px-4 py-3.5">
        <Users className="size-4 text-white/50" />
        <h2 className="flex-1 text-[11px] font-semibold tracking-[0.14em] text-white/80 uppercase">
          Participantes
        </h2>
        <span className="text-sm font-semibold text-white/50 tabular-nums">{todos.length}</span>
      </header>

      <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
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
              className="group flex items-center gap-2.5 rounded-xl px-2 py-2 transition hover:bg-white/5"
            >
              <span
                className={`grid size-8 shrink-0 place-items-center rounded-full text-xs font-semibold transition ${
                  p.isSpeaking ? "bg-waz-50 text-[#0d1424]" : "bg-white/10 text-white/70"
                }`}
              >
                {iniciaisDe(p.name || p.identity)}
              </span>

              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-white/85">
                  {p.name || p.identity}
                  {souEu && <span className="text-white/35"> · você</span>}
                </span>
              </span>

              {maoLevantada && <Hand className="size-3.5 shrink-0 text-amber-300" />}
              {semCamera && <VideoOff className="size-3.5 shrink-0 text-white/25" />}
              {mudo && <MicOff className="size-3.5 shrink-0 text-red-400" />}

              {host && !souEu && (
                <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
                  <button
                    type="button"
                    onClick={() => aoSilenciar(p.identity)}
                    disabled={mudo}
                    title={mudo ? "Já está no mudo" : `Silenciar ${p.name || p.identity}`}
                    className="grid size-7 place-items-center rounded-lg text-white/50 transition hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
                  >
                    <MicOff className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => aoRemover(p.identity)}
                    title={`Remover ${p.name || p.identity} da sala`}
                    className="grid size-7 place-items-center rounded-lg text-white/50 transition hover:bg-red-500/20 hover:text-red-300"
                  >
                    <UserMinus className="size-3.5" />
                  </button>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
