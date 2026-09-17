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
  const excesso = await guardaDeTaxa("retorno", request);
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
  //
  // A ausência do campo tem que ser tratada como recusa, e não como "não dá
  // para conferir". A versão anterior exigia igualdade SÓ quando o corpo
  // trazia `request_id` — então bastava omiti-lo para pular esta trava
  // inteira, o que transformava três travas em duas e deixava a segunda
  // inútil justamente para quem estivesse tentando burlá-la. Uma sonda contra
  // o servidor pegou isso.
  if (trabalho.externoId && transcricao.externoId !== trabalho.externoId) {
    console.warn("[deepgram] retorno recusado: request_id ausente ou diferente");
    return new Response("Não autorizado.", { status: 401 });
  }

  const recordingId = alvoDaChave(trabalho.chave);

  try {
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
  } catch (erro) {
    // A gravação pode ter sido apagada entre o pedido e o retorno — pela
    // retenção, ou por um pedido de exclusão. Isso é uma condição esperada,
    // não uma exceção: sem este `catch` ela virava 500 numa rota PÚBLICA, e
    // 500 em endereço que estranhos sondam é convite para continuar sondando.
    console.error("[deepgram] transcrição não pôde ser gravada:", erro);
    return Response.json({ ok: false, erro: "não foi possível guardar" }, { status: 409 });
  }

  await concluir(trabalho.id);
  return Response.json({ ok: true });
}
