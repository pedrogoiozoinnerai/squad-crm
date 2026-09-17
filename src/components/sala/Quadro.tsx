"use client";

import { useEffect, useRef } from "react";
import { Track, type Participant } from "livekit-client";
import { Hand, MicOff } from "lucide-react";

import { iniciaisDe } from "@/components/sala/useSala";

/**
 * O quadro de um participante.
 *
 * A trilha é anexada ao elemento por `attach`, não por `srcObject`: é o LiveKit
 * que gerencia o ciclo de vida, e trocar o srcObject à mão deixa trilha
 * pendurada quando o participante liga e desliga a câmera no meio da call.
 *
 * Numa sala clara o quadro precisa de contorno próprio: sem o fundo escuro
 * separando, um vídeo claro encosta no branco da página e o retângulo some.
 */
export function Quadro({
  participante,
  grande,
  souEu,
  fonte = "auto",
}: {
  participante: Participant;
  grande?: boolean;
  souEu?: boolean;
  /// Qual trilha desenhar. `auto` deixa a tela compartilhada vencer a câmera —
  /// é o que o quadro grande quer. `camera` força o rosto, e é o que a fita
  /// precisa: sem isso, quem compartilha tem um quadro só, ele mostra a tela, e
  /// a câmera da pessoa não aparece em lugar nenhum da sala.
  fonte?: "auto" | "camera";
}) {
  const video = useRef<HTMLVideoElement>(null);
  const audio = useRef<HTMLAudioElement>(null);

  const camera = participante.getTrackPublication(Track.Source.Camera);
  const tela = participante.getTrackPublication(Track.Source.ScreenShare);
  const microfone = participante.getTrackPublication(Track.Source.Microphone);

  const daCamera = camera?.isMuted ? undefined : camera?.track;
  const visivel = fonte === "camera" ? daCamera : (tela?.track ?? daCamera);
  const compartilhandoTela = visivel !== undefined && visivel === tela?.track;

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
  const maoLevantada = participante.attributes?.mao === "1";

  return (
    <div
      className={`relative overflow-hidden rounded-2xl transition ${
        visivel ? "bg-sala-video" : "bg-surface-2"
      } ${grande ? "size-full" : "aspect-video w-full"} ${
        // Anel preto e não verde: numa sala branca o contorno é o detalhe que
        // diz quem está falando, e preto é o que a marca usa para detalhe.
        falando ? "ring-2 ring-foreground" : "ring-1 ring-sala-linha"
      }`}
    >
      {visivel ? (
        <video
          ref={video}
          autoPlay
          playsInline
          muted={souEu}
          // `contain` na tela compartilhada: `cover` cortaria justamente as
          // bordas do slide, que é onde ficam título e rodapé.
          className={`size-full ${compartilhandoTela ? "object-contain" : "object-cover"}`}
        />
      ) : (
        <div className="grid size-full place-items-center">
          <span
            className={`grid place-items-center rounded-full bg-foreground font-semibold text-background ${
              grande ? "size-20 text-2xl sm:size-28 sm:text-4xl" : "size-12 text-base"
            }`}
          >
            {iniciaisDe(nome)}
          </span>
        </div>
      )}

      {!souEu && <audio ref={audio} autoPlay />}

      {maoLevantada && (
        <span
          className="absolute top-2 right-2 grid size-8 place-items-center rounded-full bg-background shadow-sm ring-1 ring-sala-linha"
          title={`${nome} levantou a mão`}
        >
          <Hand className="size-4" />
        </span>
      )}

      {/* O rótulo fica sobre vídeo ou sobre superfície clara conforme a câmera.
          Fundo próprio e opaco, então, em vez de herdar o do quadro: sem ele o
          nome some em cima de uma camisa branca. */}
      <span className="absolute bottom-2 left-2 flex max-w-[calc(100%-1rem)] items-center gap-1.5 rounded-lg bg-background/90 px-2.5 py-1 text-xs font-medium backdrop-blur">
        {mudo && <MicOff className="size-3.5 shrink-0 text-red-600" />}
        <span className="truncate">{nome}</span>
        {souEu && <span className="shrink-0 text-muted">· você</span>}
      </span>
    </div>
  );
}
