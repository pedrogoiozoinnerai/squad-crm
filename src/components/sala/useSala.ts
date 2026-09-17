"use client";

import { useEffect, useRef, useState } from "react";
import { RoomEvent, Track, type Participant, type Room } from "livekit-client";

import { FOCO_VAZIO, proximoFoco, quandoReavaliar, type EstadoDoFoco } from "@/lib/foco";
import { ehGravador } from "@/lib/identidades";

/**
 * Faz o React reagir à sala.
 *
 * Em vez de espelhar o estado do LiveKit em `useState` — que é onde nascem as
 * divergências entre o que a tela mostra e o que a sala é —, só contamos as
 * mudanças e lemos a sala direto na renderização. A fonte da verdade continua
 * sendo uma só.
 *
 * A exceção é o FOCO — quem aparece grande. Esse não pode sair direto de
 * `sala.activeSpeakers`, porque `activeSpeakers` muda a cada respiração e a
 * tela piscava de rosto em rosto. A regra vive em `lib/foco`, é pura, e aqui
 * só recebe o relógio.
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
  RoomEvent.ParticipantAttributesChanged,
  RoomEvent.RoomMetadataChanged,
  RoomEvent.ConnectionStateChanged,
] as const;

export function useSala(sala: Room | null) {
  const [, redesenhar] = useState(0);
  const [foco, setFoco] = useState<EstadoDoFoco>(FOCO_VAZIO);
  const focoAtual = useRef(FOCO_VAZIO);

  useEffect(() => {
    if (!sala) return;
    const aoMudar = () => redesenhar((n) => n + 1);
    for (const evento of MUDANCAS) sala.on(evento, aoMudar);
    return () => {
      for (const evento of MUDANCAS) sala.off(evento, aoMudar);
    };
  }, [sala]);

  useEffect(() => {
    if (!sala) return;
    let despertador: ReturnType<typeof setTimeout> | undefined;

    const avaliar = () => {
      clearTimeout(despertador);

      const eu = sala.localParticipant;
      const presentes = [eu, ...sala.remoteParticipants.values()]
        .map((p) => p.identity)
        .filter((id) => !ehGravador(id));
      // Quem fala AGORA, tirando eu mesmo: ninguém quer se ver grande enquanto
      // fala, e o próprio rosto no quadro principal rouba a sessão do lead.
      const candidato =
        sala.activeSpeakers.find((p) => p.identity !== eu.identity)?.identity ?? null;

      // Quem está com a tela no ar. Ganha do falante — compartilhar tela é a
      // intenção mais explícita que existe numa call, e antes ela ia parar na
      // fita lateral do tamanho de um selo.
      const compartilhando =
        [eu, ...sala.remoteParticipants.values()]
          .filter((p) => !ehGravador(p.identity))
          .find((p) => p.getTrackPublication(Track.Source.ScreenShare))?.identity ?? null;

      const agora = Date.now();
      const proximo = proximoFoco(
        focoAtual.current,
        { candidato, presentes, compartilhando },
        agora,
      );
      if (proximo !== focoAtual.current) {
        focoAtual.current = proximo;
        setFoco(proximo);
      }

      // O evento que falta é "o candidato completou a sustentação" — ele é a
      // ausência de evento, e ninguém o emite. Sem este despertador, quem
      // assume a palavra e fala sem parar nunca apareceria.
      const falta = quandoReavaliar(proximo, agora);
      if (falta !== null) despertador = setTimeout(avaliar, Math.max(falta, 50));
    };

    avaliar();
    const gatilhos = [
      RoomEvent.ActiveSpeakersChanged,
      RoomEvent.ParticipantConnected,
      RoomEvent.ParticipantDisconnected,
      // Os de trilha entram porque começar a compartilhar não reavaliava o foco:
      // a tela só apareceria na próxima vez que alguém falasse.
      RoomEvent.TrackPublished,
      RoomEvent.TrackUnpublished,
      RoomEvent.LocalTrackPublished,
      RoomEvent.LocalTrackUnpublished,
      RoomEvent.TrackSubscribed,
      RoomEvent.TrackUnsubscribed,
    ] as const;
    for (const evento of gatilhos) sala.on(evento, avaliar);
    return () => {
      clearTimeout(despertador);
      for (const evento of gatilhos) sala.off(evento, avaliar);
    };
  }, [sala]);

  if (!sala) {
    return { eu: null, todos: [] as Participant[], falando: null as Participant | null };
  }

  const eu = sala.localParticipant;
  // O gravador é um participante de verdade: o LiveKit sobe um navegador sem
  // tela e ele entra na sala. Sem tirá-lo daqui ele vira um quadrado preto
  // permanente no meio de trinta rostos, some do jeito errado na contagem
  // ("31 na sala") e chega a ganhar o foco quando ninguém está falando.
  const remotos = [...sala.remoteParticipants.values()].filter((p) => !ehGravador(p.identity));
  const todos = [eu, ...remotos];

  // O foco é uma identidade, não um objeto: o participante pode ter sido
  // recriado pelo LiveKit entre uma avaliação e o desenho.
  const falando = todos.find((p) => p.identity === foco.identidade) ?? remotos[0] ?? eu;

  return { eu, todos, falando };
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
