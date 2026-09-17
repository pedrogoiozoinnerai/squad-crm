import type { NextRequest } from "next/server";

import { portaDoCorpo, quemEstaNaSala } from "@/lib/acesso-a-sala";
import { salaDaReuniao, tokenDeAcesso } from "@/lib/livekit";
import { chavesDoLiveKit, criarSala } from "@/lib/livekit-servidor";
import { prisma } from "@/lib/prisma";
import { guardaDeTaxa } from "@/lib/limite-servidor";
import { janelaDaSala, situacaoDaSala } from "@/lib/sala";

/**
 * Emite o token de entrada na sala.
 *
 * Route handler e não Server Action: a resposta é um segredo de curta duração
 * que não pode ser cacheado, e isso se declara num `Response`.
 *
 * TRÊS portas, uma rota — e as regras de quem é quem vivem em
 * `lib/acesso-a-sala`, porque a rota de mensagens do chat precisa exatamente
 * das mesmas. Duas cópias da mesma autorização é uma cópia que envelhece.
 */
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  // Esta rota resolve convites e links: sem teto, ela vira o oráculo de quais
  // tokens existem, um palpite por requisição.
  const barrado = await guardaDeTaxa("token", request);
  if (barrado) return barrado;

  const chaves = chavesDoLiveKit();
  if (!chaves) {
    return Response.json({ erro: "As reuniões por vídeo ainda não foram configuradas." }, { status: 503 });
  }

  let corpo: { meetingId?: string; convite?: string; convidado?: string; nome?: string };
  try {
    corpo = await request.json();
  } catch {
    return Response.json({ erro: "Corpo inválido." }, { status: 400 });
  }

  const quem = await quemEstaNaSala(portaDoCorpo(corpo));

  if ("erro" in quem) return Response.json({ erro: quem.erro }, { status: quem.status });

  const { reuniao, identidade, nome, host, attendeeId } = quem;

  // A mesma régua que a página do convite usa para mostrar (ou não) o botão.
  const agora = new Date();
  const { abreEm, fechaEm } = janelaDaSala(reuniao);
  const situacao = situacaoDaSala(reuniao, agora);

  if (situacao === "esperando") {
    return Response.json(
      { erro: "A sala ainda não abriu.", abreEm: abreEm.toISOString() },
      { status: 409 },
    );
  }
  if (situacao === "encerrada") {
    return Response.json({ erro: "Esta reunião já terminou." }, { status: 409 });
  }
  if (situacao === "cancelada") {
    return Response.json({ erro: "Esta reunião foi cancelada." }, { status: 409 });
  }

  const duracaoMin = Math.max(
    15,
    Math.round((reuniao.endsAt.getTime() - reuniao.startsAt.getTime()) / 60_000),
  );

  try {
    await criarSala(reuniao.id, { duracaoMin, inicio: reuniao.startsAt });
  } catch (erro) {
    // A sala não subiu: sem ela o token não serve de nada, e um token emitido
    // aqui viraria uma tela de call que nunca conecta, sem dizer por quê.
    console.error("[livekit/token] criarSala falhou:", erro);
    return Response.json({ erro: "Não foi possível abrir a sala agora." }, { status: 502 });
  }

  // Conta o acesso do convite só depois de a sala existir de verdade.
  if (attendeeId) {
    await prisma.meetingAttendee.update({
      where: { id: attendeeId },
      data: {
        openCount: { increment: 1 },
        firstOpenedAt: quem.primeiroAcesso ? new Date() : undefined,
      },
    });
  }

  // Vale até o fim da janela da sala, nunca mais que isso.
  const validadeSegundos = Math.max(300, Math.round((fechaEm.getTime() - agora.getTime()) / 1000));

  return Response.json(
    {
      url: chaves.url,
      token: tokenDeAcesso({
        apiKey: chaves.apiKey,
        apiSecret: chaves.apiSecret,
        sala: salaDaReuniao(reuniao.id),
        identidade,
        nome,
        host,
        validadeSegundos,
      }),
      sala: salaDaReuniao(reuniao.id),
      host,
      nome,
      // A identidade volta para o cliente porque quem entrou pelo LINK precisa
      // dela de novo ao escrever no chat: ele não tem conta nem inscrição, e
      // sem repetir a mesma identidade cada mensagem sua viraria de outra
      // pessoa. A rota de mensagens só aceita de volta o que tem cara de
      // convidado — ver `identidadeDoLink`.
      identidade,
      reuniao: { id: reuniao.id, titulo: reuniao.title, comecaEm: reuniao.startsAt.toISOString() },
    },
    { headers: { "cache-control": "no-store" } },
  );
}
