"use client";

import { useEffect, useState } from "react";
import { RoomEvent, type Participant, type Room } from "livekit-client";

/**
 * Faz o React reagir à sala.
 *
 * Em vez de espelhar o estado do LiveKit em `useState` — que é onde nascem as
 * divergências entre o que a tela mostra e o que a sala é —, só contamos as
 * mudanças e lemos a sala direto na renderização. A fonte da verdade continua
 * sendo uma só.
 */
const MUDANCAS = [
  RoomEvent.ParticipantConnected,
  RoomEvent.ParticipantDisconnected,
  RoomEvent.TrackSubscribed,
  RoomEvent.TrackUnsubscribed,
  RoomEvent.TrackMuted,
  RoomEvent.TrackUnmuted,
  RoomEvent.LocalTrackPublished,
  RoomEvent.LocalTrackUnpublished,
  RoomEvent.ActiveSpeakersChanged,
  RoomEvent.ConnectionQualityChanged,
  RoomEvent.ParticipantMetadataChanged,
  RoomEvent.ConnectionStateChanged,
] as const;

export function useSala(sala: Room | null) {
  const [, redesenhar] = useState(0);

  useEffect(() => {
    if (!sala) return;
    const aoMudar = () => redesenhar((n) => n + 1);
    for (const evento of MUDANCAS) sala.on(evento, aoMudar);
    return () => {
      for (const evento of MUDANCAS) sala.off(evento, aoMudar);
    };
  }, [sala]);

  if (!sala) {
    return { eu: null, todos: [] as Participant[], falando: null as Participant | null };
  }

  const eu = sala.localParticipant;
  const remotos = [...sala.remoteParticipants.values()];

  // Quem aparece grande: quem está falando; se ninguém fala, o primeiro remoto;
  // se estou sozinho, eu. Sem isto a tela ficaria pulando de rosto a cada
  // respiração — por isso é o falante ATIVO do LiveKit, que já tem histerese.
  const falando =
    sala.activeSpeakers.find((p) => p.identity !== eu.identity) ?? remotos[0] ?? eu;

  return { eu, todos: [eu, ...remotos], falando };
}

/** Iniciais para o círculo de quem está sem câmera. */
export function iniciaisDe(nome: string) {
  return nome
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}
