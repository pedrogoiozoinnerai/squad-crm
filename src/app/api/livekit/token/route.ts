import { randomBytes } from "node:crypto";
import type { NextRequest } from "next/server";

import { getSessionUser } from "@/lib/auth";
import {
  identidadeDeConvidado,
  identidadeDoLead,
  identidadeDoUsuario,
  salaDaReuniao,
  tokenDeAcesso,
} from "@/lib/livekit";
import { chavesDoLiveKit, criarSala } from "@/lib/livekit-servidor";
import { prisma } from "@/lib/prisma";
import { janelaDaSala, situacaoDaSala } from "@/lib/sala";

/**
 * Emite o token de entrada na sala.
 *
 * Route handler e não Server Action: a resposta é um segredo de curta duração
 * que não pode ser cacheado, e isso se declara num `Response`.
 *
 * Duas portas, uma rota. O vendedor entra pela sessão e é host; o lead entra
 * pelo token do convite e não é. Quem não tem nenhum dos dois não entra — não
 * existe caminho "só com o id da reunião", porque id é adivinhável.
 */
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
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

  const quem = corpo.convite
    ? await pelaConvite(corpo.convite)
    : corpo.convidado
      ? await peloLink(corpo.convidado, corpo.nome)
      : await pelaSessao(corpo.meetingId);

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
    await criarSala(reuniao.id, { duracaoMin });
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
      reuniao: { id: reuniao.id, titulo: reuniao.title, comecaEm: reuniao.startsAt.toISOString() },
    },
    { headers: { "cache-control": "no-store" } },
  );
}

type Autorizado = {
  reuniao: { id: string; title: string; startsAt: Date; endsAt: Date; status: string };
  identidade: string;
  nome: string;
  host: boolean;
  attendeeId?: string;
  primeiroAcesso?: boolean;
};

/** O vendedor: entra pela sessão do CRM, e é host da própria reunião. */
async function pelaSessao(meetingId?: string): Promise<Autorizado | { erro: string; status: number }> {
  if (!meetingId) return { erro: "Reunião não informada.", status: 400 };

  const user = await getSessionUser();
  if (!user) return { erro: "Não autenticado.", status: 401 };

  const reuniao = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: { id: true, title: true, startsAt: true, endsAt: true, status: true, ownerId: true },
  });
  if (!reuniao) return { erro: "Reunião não encontrada.", status: 404 };

  // Mesma régua do resto do CRM: admin vê tudo, vendedor só o que é dele.
  if (user.role !== "ADMIN" && reuniao.ownerId !== user.id) {
    return { erro: "Esta reunião não é sua.", status: 403 };
  }

  return { reuniao, identidade: identidadeDoUsuario(user.id), nome: user.name, host: true };
}

/**
 * O convidado: entra pelo LINK da reunião, e nunca é host.
 *
 * A terceira porta. As outras duas exigem ou conta no CRM ou estar inscrito
 * como lead — e nenhuma das duas serve para "me manda o link": call interna,
 * convidado fora do funil, conversa marcada na hora.
 *
 * Quem entra por aqui é medido em `Presence` como qualquer um e não vira
 * inscrito de ninguém. O nome é o que a pessoa digitar: não temos como saber
 * quem é, e inventar "Convidado 1" some com a informação que ela mesma daria.
 */
async function peloLink(
  token: string,
  nomeDigitado?: string,
): Promise<Autorizado | { erro: string; status: number }> {
  const reuniao = await prisma.meeting.findUnique({
    where: { guestToken: token },
    select: { id: true, title: true, startsAt: true, endsAt: true, status: true },
  });

  // Mesma resposta de um convite inválido: quem sonda não descobre quais
  // links existem testando.
  if (!reuniao) return { erro: "Link inválido ou expirado.", status: 404 };

  const nome = (nomeDigitado ?? "").trim().slice(0, 60) || "Convidado";

  return {
    reuniao,
    // Sufixo aleatório por ENTRADA: o mesmo link aberto por duas pessoas dá
    // duas identidades. Repetida, o LiveKit derrubaria a primeira.
    identidade: identidadeDeConvidado(randomBytes(6).toString("hex")),
    nome,
    host: false,
  };
}

/** O lead: entra pelo token do convite, e nunca é host. */
async function pelaConvite(token: string): Promise<Autorizado | { erro: string; status: number }> {
  const convidado = await prisma.meetingAttendee.findUnique({
    where: { inviteToken: token },
    select: {
      id: true,
      leadId: true,
      status: true,
      firstOpenedAt: true,
      lead: { select: { name: true } },
      meeting: {
        select: { id: true, title: true, startsAt: true, endsAt: true, status: true },
      },
    },
  });

  // Mesma resposta para token inexistente e para convite cancelado: um atacante
  // não descobre quais tokens existem testando.
  if (!convidado || convidado.status === "CANCELADO") {
    return { erro: "Convite inválido ou expirado.", status: 404 };
  }

  return {
    reuniao: convidado.meeting,
    identidade: identidadeDoLead(convidado.leadId),
    nome: convidado.lead.name,
    // O lead nunca administra a sala: sem isto ele poderia remover o vendedor.
    host: false,
    attendeeId: convidado.id,
    primeiroAcesso: convidado.firstOpenedAt === null,
  };
}
