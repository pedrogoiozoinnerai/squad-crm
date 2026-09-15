import type { NextRequest } from "next/server";

import { lerWebhook, reuniaoDaSala } from "@/lib/livekit";
import { chavesDoLiveKit } from "@/lib/livekit-servidor";
import { prisma } from "@/lib/prisma";

/**
 * Entrada dos eventos de sala do LiveKit.
 *
 * Só INSERE evento cru. Não decide presença, não mexe em reunião, não escreve
 * status — isso é da reconciliação, que é idempotente e pode rodar de novo.
 * Webhook que escreve estado direto não tem como se recuperar de um evento
 * perdido, e é assim que se acumula mil participação errada sem ninguém ver.
 */
export async function POST(request: NextRequest) {
  const chaves = chavesDoLiveKit();
  if (!chaves) return new Response("LiveKit não configurado.", { status: 503 });

  // O corpo CRU, antes de qualquer parse: a assinatura é sobre estes bytes.
  const corpoCru = await request.text();

  const lido = lerWebhook(corpoCru, request.headers.get("authorization"), chaves.apiKey, chaves.apiSecret);
  if ("erro" in lido) {
    // 401 sem detalhe: este endereço é público e vai ser sondado. O motivo
    // fica no log do servidor, não na resposta.
    console.warn(`[livekit] webhook recusado: ${lido.erro}`);
    return new Response("Não autorizado.", { status: 401 });
  }

  // Evento de gravação e evento de sala guardam o mesmo fato cru, na mesma
  // tabela: o que chegou, quando, de qual sala. `Recording` (com arquivo,
  // tamanho e duração) entra junto com a gravação — até lá, gravar aqui é o
  // que garante que nenhum evento se perca no caminho.
  const evento =
    "evento" in lido
      ? lido.evento
      : {
          id: lido.egress.id,
          tipo: lido.egress.tipo,
          sala: lido.egress.sala,
          em: lido.egress.em,
          identidade: null,
          nome: lido.egress.egressId,
        };

  const meetingId = reuniaoDaSala(evento.sala);

  try {
    await prisma.roomEvent.create({
      data: {
        livekitId: evento.id,
        type: evento.tipo,
        room: evento.sala,
        at: evento.em,
        identity: evento.identidade,
        name: evento.nome,
        // Só amarra se a reunião existir de verdade — o LiveKit não sabe do
        // nosso banco, e uma sala apagada geraria erro de chave estrangeira
        // num endpoint que precisa responder 200.
        meetingId: meetingId
          ? ((await prisma.meeting.findUnique({ where: { id: meetingId }, select: { id: true } }))?.id ??
            null)
          : null,
      },
    });
  } catch (erro) {
    // P2002 = já recebemos este evento. O LiveKit reentrega quando não vê 200,
    // então repetição é o funcionamento normal, não falha.
    if ((erro as { code?: string }).code !== "P2002") throw erro;
  }

  return Response.json({ ok: true });
}
