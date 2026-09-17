import type { NextRequest } from "next/server";

import { env } from "@/lib/env";
import { guardaDeTaxa } from "@/lib/limite-servidor";
import { prisma } from "@/lib/prisma";
import { retornoConfere } from "@/lib/retorno";
import { alvoDaChave, concluir, trabalhoEsperando } from "@/lib/trabalhos";
import { lerRespostaDeepgram } from "@/lib/transcricao";

/**
 * Onde a transcrição chega.
 *
 * **A Deepgram não assina o callback.** O LiveKit manda um JWT com o sha256 do
 * corpo; ela manda o corpo e pronto. Quem descobrir este endereço pode fazer o
 * mesmo POST e gravar o "que foi dito" numa call de um cliente — e depois isso
 * vira o resumo que o closer lê e a auditoria que o gestor lê.
 *
 * Por isso são três travas, e nenhuma delas sozinha bastaria:
 *
 *  1. o endereço carrega um token derivado do id do trabalho por HMAC, comparado
 *     sem vazar tempo;
 *  2. o `request_id` do corpo precisa bater com o que guardamos ao fazer o
 *     pedido — sem isso, um token vazado serviria para qualquer conteúdo;
 *  3. o trabalho precisa estar `AGUARDANDO` — um retorno repetido não
 *     sobrescreve uma transcrição que já ficou pronta.
 *
 * Mais o limite de taxa, porque é um endereço público que estranhos vão sondar.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ trabalho: string; token: string }> },
) {
  const excesso = await guardaDeTaxa("mensagens", request);
  if (excesso) return excesso;

  const { trabalho: trabalhoId, token } = await params;
  const segredo = env("CRON_SECRET");

  // Sem segredo não há como conferir nada — e uma rota pública que grava no
  // banco sem conferir é pior que uma rota fora do ar.
  if (!segredo || !retornoConfere(trabalhoId, token, segredo)) {
    console.warn("[deepgram] retorno recusado: token inválido");
    return new Response("Não autorizado.", { status: 401 });
  }

  const trabalho = await trabalhoEsperando(trabalhoId);
  if (!trabalho) {
    // 200 de propósito: o trabalho já foi concluído, ou desistiu. A Deepgram
    // reentrega o que não recebe 2xx, e um 404 aqui viraria reentrega infinita
    // de uma transcrição que já está no banco.
    return Response.json({ ok: true, ignorado: "trabalho não está esperando" });
  }

  let corpo: unknown;
  try {
    corpo = await request.json();
  } catch {
    return new Response("Corpo inválido.", { status: 400 });
  }

  const transcricao = lerRespostaDeepgram(corpo);
  if (!transcricao) {
    return new Response("Resposta sem transcrição.", { status: 400 });
  }

  // O `request_id` é a segunda trava: sem ela, um token vazado gravaria
  // qualquer texto como sendo o que foi dito na call.
  if (trabalho.externoId && transcricao.externoId && transcricao.externoId !== trabalho.externoId) {
    console.warn("[deepgram] retorno recusado: request_id não confere");
    return new Response("Não autorizado.", { status: 401 });
  }

  const recordingId = alvoDaChave(trabalho.chave);

  await prisma.transcript.upsert({
    where: { recordingId },
    create: {
      recordingId,
      externoId: transcricao.externoId,
      texto: transcricao.texto,
      segmentos: transcricao.segmentos,
      falantes: transcricao.falantes,
      idioma: transcricao.idioma,
      modelo: transcricao.modelo,
    },
    update: {
      texto: transcricao.texto,
      segmentos: transcricao.segmentos,
      falantes: transcricao.falantes,
      idioma: transcricao.idioma,
      modelo: transcricao.modelo,
    },
  });

  await concluir(trabalho.id);
  return Response.json({ ok: true });
}
