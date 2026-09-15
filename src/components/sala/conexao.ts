import { Room } from "livekit-client";

import type { Preferencias } from "@/components/sala/Preparo";

/**
 * Conecta à sala do LiveKit.
 *
 * Módulo separado e importado sob demanda: o `livekit-client` traz o WebRTC
 * inteiro, e quem abre a antessala e desiste não precisa baixá-lo.
 */
export async function conectar({
  url,
  token,
  preferencias,
}: {
  url: string;
  token: string;
  preferencias: Preferencias;
}) {
  const sala = new Room({
    // Ajusta a resolução ao tamanho real do quadro na tela: numa grade de oito
    // participantes ninguém precisa receber 720p de cada um.
    adaptiveStream: true,
    dynacast: true,
  });

  // Quem ouve `Disconnected` é a tela da reunião, que precisa mostrar "você
  // saiu". Um `removeAllListeners` aqui apagaria justamente esse ouvinte, e o
  // participante ficaria olhando uma sala congelada.
  await sala.connect(url, token);
  await sala.localParticipant.setMicrophoneEnabled(preferencias.microfone);
  await sala.localParticipant.setCameraEnabled(preferencias.camera);

  return sala;
}
