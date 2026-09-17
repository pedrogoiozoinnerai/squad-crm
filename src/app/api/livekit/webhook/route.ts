import type { NextRequest } from "next/server";

import { derivarGravacao, semSegredos } from "@/lib/gravacao";
import { lerWebhook, reuniaoDaSala, type EventoDeEgress } from "@/lib/livekit";
import { chavesDoLiveKit } from "@/lib/livekit-servidor";
import { prisma } from "@/lib/prisma";

/**
 * Entrada dos eventos de sala do LiveKit.
 *
 * Dos eventos de SALA, só insere o fato cru. Não decide presença, não mexe em
 * reunião, não escreve status — isso é da reconciliação, que é idempotente e
 * pode rodar de novo. Webhook que escreve estado direto não tem como se
 * recuperar de um evento perdido, e é assim que se acumula mil participação
 * errada sem ninguém ver.
 *
 * Dos eventos de GRAVAÇÃO, derivado é diferente de decidido: `Recording` é
 * função pura do evento (`derivarGravacao`), com avanço monotônico, e pode ser
 * reconstruído do zero pelo `ListEgress`. A alternativa era o que havia antes —
 * achatar tudo num `RoomEvent` com o `egressId` no campo `name` e jogar fora
 * arquivo, tamanho e duração, que é a única coisa que o LiveKit manda e que
 * ninguém mais sabe.
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

  const idDaSala = reuniaoDaSala(evento.sala);
  // Só amarra se a reunião existir de verdade — o LiveKit não sabe do nosso
  // banco, e uma sala apagada geraria erro de chave estrangeira num endpoint
  // que precisa responder 200.
  const meetingId = idDaSala
    ? ((await prisma.meeting.findUnique({ where: { id: idDaSala }, select: { id: true } }))?.id ??
      null)
    : null;

  // A gravação ANTES do evento cru, e não depois: numa reentrega, o insert do
  // evento falha por chave repetida e uma tentativa anterior que morreu no meio
  // teria deixado a gravação sem atualizar para sempre.
  if ("egress" in lido && meetingId) {
    await guardarGravacao(lido.egress, meetingId, corpoCru).catch((erro) => {
      // Falhar aqui não pode virar 401/500: o LiveKit reentregaria sem parar, e
      // o evento cru abaixo é o que permite reconstruir isto depois.
      console.error("[livekit] gravação não registrada:", erro);
    });
  }

  try {
    await prisma.roomEvent.create({
      data: {
        livekitId: evento.id,
        type: evento.tipo,
        room: evento.sala,
        at: evento.em,
        identity: evento.identidade,
        name: evento.nome,
        meetingId,
      },
    });
  } catch (erro) {
    // P2002 = já recebemos este evento. O LiveKit reentrega quando não vê 200,
    // então repetição é o funcionamento normal, não falha.
    if ((erro as { code?: string }).code !== "P2002") throw erro;
  }

  return Response.json({ ok: true });
}

/**
 * Registra o que o evento de egress diz sobre o arquivo.
 *
 * Lê o que já existe antes de escrever porque a decisão é relativa: `avancar`
 * precisa saber de onde se está saindo, e um `egress_updated` magro — que chega
 * sem `fileResults` durante a call — não pode apagar o caminho que um
 * `egress_ended` reentregue fora de ordem já tinha trazido.
 */
async function guardarGravacao(egress: EventoDeEgress, meetingId: string, corpoCru: string) {
  const atual = await prisma.recording.findUnique({
    where: { egressId: egress.egressId },
    select: {
      status: true,
      caminho: true,
      bytes: true,
      duracaoSegundos: true,
      iniciadaEm: true,
      terminadaEm: true,
      erro: true,
    },
  });

  const derivada = derivarGravacao(egress, {
    ...atual,
    // `bytes` é BIGINT no banco e `bigint` em JS. A aritmética e as
    // comparações do módulo puro são em `number`, e misturar os dois lança
    // TypeError em tempo de execução, não de compilação.
    bytes: atual?.bytes != null ? Number(atual.bytes) : null,
  });

  const dados = {
    status: derivada.status,
    caminho: derivada.caminho,
    bytes: derivada.bytes != null ? BigInt(Math.round(derivada.bytes)) : null,
    duracaoSegundos: derivada.duracaoSegundos,
    iniciadaEm: derivada.iniciadaEm,
    terminadaEm: derivada.terminadaEm,
    erro: derivada.erro,
    // O `egressInfo` inteiro, como chegou — menos o que parecer credencial.
    // Sem ele "falhou" é beco sem saída, e a forma desse JSON muda do lado
    // deles sem avisar; com ele cru, a chave de escrita do nosso bucket poderia
    // ir parar numa coluna `jsonb` e em todo backup do banco.
    bruto: semSegredos(JSON.parse(corpoCru)) as object,
  };

  await prisma.recording.upsert({
    where: { egressId: egress.egressId },
    create: { egressId: egress.egressId, meetingId, ...dados },
    update: dados,
  });
}
