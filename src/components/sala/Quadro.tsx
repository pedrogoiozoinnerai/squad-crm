"use client";

import { useEffect, useRef } from "react";
import { Track, type Participant } from "livekit-client";
import { MicOff } from "lucide-react";

import { iniciaisDe } from "@/components/sala/useSala";

/**
 * O quadro de um participante.
 *
 * A trilha é anexada ao elemento por `attach`, não por `srcObject`: é o LiveKit
 * que gerencia o ciclo de vida, e trocar o srcObject à mão deixa trilha
 * pendurada quando o participante liga e desliga a câmera no meio da call.
 */
export function Quadro({
  participante,
  grande,
  souEu,
}: {
  participante: Participant;
  grande?: boolean;
  souEu?: boolean;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const audio = useRef<HTMLAudioElement>(null);

  const camera = participante.getTrackPublication(Track.Source.Camera);
  const tela = participante.getTrackPublication(Track.Source.ScreenShare);
  const microfone = participante.getTrackPublication(Track.Source.Microphone);

  const visivel = tela?.track ?? (camera?.isMuted ? undefined : camera?.track);

  useEffect(() => {
    const elemento = video.current;
    if (!elemento || !visivel) return;
    visivel.attach(elemento);
    return () => {
      visivel.detach(elemento);
    };
  }, [visivel]);

  useEffect(() => {
    // O próprio áudio nunca é reproduzido de volta: seria microfonia.
    if (souEu) return;
    const elemento = audio.current;
    const trilha = microfone?.track;
    if (!elemento || !trilha) return;
    trilha.attach(elemento);
    return () => {
      trilha.detach(elemento);
    };
  }, [microfone?.track, souEu]);

  const nome = participante.name || participante.identity;
  const mudo = !microfone || microfone.isMuted;
  const falando = participante.isSpeaking;

  return (
    <div
      className={`relative overflow-hidden rounded-2xl bg-[#1a2540] transition ${
        grande ? "size-full" : "aspect-video w-full"
      } ${falando ? "ring-2 ring-waz-50" : ""}`}
    >
      {visivel ? (
        <video
          ref={video}
          autoPlay
          playsInline
          muted={souEu}
          className="size-full object-cover"
        />
      ) : (
        <div className="grid size-full place-items-center">
          <span
            className={`grid place-items-center rounded-full bg-white/10 font-semibold text-white/70 ${
              grande ? "size-32 text-4xl" : "size-14 text-lg"
            }`}
          >
            {iniciaisDe(nome)}
          </span>
        </div>
      )}

      {!souEu && <audio ref={audio} autoPlay />}

      <span className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-lg bg-black/55 px-2.5 py-1 text-xs font-medium text-white backdrop-blur">
        {mudo && <MicOff className="size-3.5 text-red-400" />}
        <span className="max-w-[180px] truncate">{nome}</span>
        {souEu && <span className="text-white/50">· você</span>}
      </span>
    </div>
  );
}
