import "server-only";

import { env } from "@/lib/env";
import { salaDaReuniao, tokenDeServico, urlHttpDoLiveKit } from "@/lib/livekit";

/**
 * As chaves do LiveKit, lidas num lugar só.
 *
 * Devolve `null` quando não estão configuradas, em vez de lançar: sem elas o
 * CRM inteiro continua funcionando — só as reuniões por vídeo é que não. Uma
 * exceção aqui derrubaria telas que não têm nada a ver com isso.
 */
export function chavesDoLiveKit() {
  const url = env("LIVEKIT_URL");
  const apiKey = env("LIVEKIT_API_KEY");
  const apiSecret = env("LIVEKIT_API_SECRET");
  if (!url || !apiKey || !apiSecret) return null;
  return { url, apiKey, apiSecret };
}

export function livekitConfigurado() {
  return chavesDoLiveKit() !== null;
}

/**
 * Chamada de administração ao LiveKit.
 *
 * A API deles é twirp — JSON sobre HTTP POST, um endereço por método. Sem SDK
 * de servidor pela mesma razão do resto deste módulo: são duas chamadas, e a
 * dependência traria uma árvore inteira para assinar o que já sabemos assinar.
 */
async function chamar(
  metodo: string,
  corpo: Record<string, unknown>,
  concessoes: {
    roomCreate?: boolean;
    roomList?: boolean;
    roomRecord?: boolean;
    roomAdmin?: boolean;
    room?: string;
  },
) {
  const chaves = chavesDoLiveKit();
  if (!chaves) throw new Error("LiveKit não configurado.");

  const resposta = await fetch(`${urlHttpDoLiveKit(chaves.url)}/twirp/${metodo}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${tokenDeServico({
        apiKey: chaves.apiKey,
        apiSecret: chaves.apiSecret,
        concessoes,
      })}`,
    },
    body: JSON.stringify(corpo),
    // Uma chamada de controle não pode segurar a rota: se o LiveKit não
    // responde em 10s, a sala não vai abrir de qualquer jeito.
    signal: AbortSignal.timeout(10_000),
  });

  if (!resposta.ok) {
    const detalhe = await resposta.text().catch(() => "");
    throw new Error(`LiveKit ${metodo} respondeu ${resposta.status}: ${detalhe.slice(0, 200)}`);
  }
  return resposta.json() as Promise<Record<string, unknown>>;
}

/**
 * Garante que a sala existe antes de alguém entrar.
 *
 * O LiveKit criaria a sala sozinho no primeiro `join`, e então não haveria onde
 * pendurar a configuração — nem `maxParticipants`, nem o egress automático que
 * a gravação vai precisar. Criar explicitamente também dá um ponto único onde
 * consentimento e lotação são verificados.
 *
 * Chamar de novo para uma sala existente é inofensivo: o LiveKit devolve a que
 * já está lá.
 */
export async function criarSala(
  meetingId: string,
  opcoes: { duracaoMin: number; maxParticipantes?: number },
) {
  const nome = salaDaReuniao(meetingId);

  await chamar(
    "livekit.RoomService/CreateRoom",
    {
      name: nome,
      // Fecha a sala 5 min depois de esvaziar — é o que dispara o
      // `room_finished` de que a presença depende para fechar quem não saiu.
      emptyTimeout: 5 * 60,
      // Teto duro: a duração marcada mais uma hora de folga. Sem isso uma sala
      // esquecida aberta fica consumindo minutos a noite inteira.
      departureTimeout: 60,
      maxParticipants: opcoes.maxParticipantes ?? 0,
      metadata: JSON.stringify({ meetingId, duracaoMin: opcoes.duracaoMin }),
    },
    { roomCreate: true },
  );

  return { sala: nome };
}
