import "server-only";

import { randomBytes } from "node:crypto";

import { getSessionUser } from "@/lib/auth";
import { identidadeDeConvidado, identidadeDoLead, identidadeDoUsuario } from "@/lib/livekit";
import { prisma } from "@/lib/prisma";

/**
 * Quem é esta pessoa, nesta sala — as três portas num lugar só.
 *
 * O vendedor entra pela sessão do CRM e é host; o lead entra pelo token do
 * convite; o convidado entra pelo link da reunião. Nenhuma dessas regras pode
 * divergir entre as rotas: a de token diz quem entra na sala, e a de mensagens
 * diz quem escreve nela. Se as duas tivessem cópias da mesma regra, uma delas
 * envelheceria — e a que envelhece é sempre a segunda.
 *
 * Não existe caminho "só com o id da reunião": id é adivinhável a partir de
 * outro.
 */

export type Porta =
  | { porta: "sessao"; meetingId?: string }
  | { porta: "convite"; convite: string }
  | {
      porta: "link";
      convidado: string;
      nome?: string;
      /// A identidade que o convidado já recebeu ao entrar. Só é aceita se
      /// tiver a cara de uma identidade de convidado — ver `identidadeDoLink`.
      identidade?: string;
    };

export type NaSala = {
  reuniao: { id: string; title: string; startsAt: Date; endsAt: Date; status: string };
  identidade: string;
  nome: string;
  host: boolean;
  attendeeId?: string;
  primeiroAcesso?: boolean;
};

export type Recusa = { erro: string; status: number };

export async function quemEstaNaSala(porta: Porta): Promise<NaSala | Recusa> {
  switch (porta.porta) {
    case "convite":
      return pelaConvite(porta.convite);
    case "link":
      return peloLink(porta.convidado, porta.nome, porta.identidade);
    case "sessao":
      return pelaSessao(porta.meetingId);
  }
}

/** Lê o corpo de uma requisição e diz por qual porta ela vem. */
export function portaDoCorpo(corpo: {
  meetingId?: string;
  convite?: string;
  convidado?: string;
  nome?: string;
  identidade?: string;
}): Porta {
  if (corpo.convite) return { porta: "convite", convite: corpo.convite };
  if (corpo.convidado) {
    return {
      porta: "link",
      convidado: corpo.convidado,
      nome: corpo.nome,
      identidade: corpo.identidade,
    };
  }
  return { porta: "sessao", meetingId: corpo.meetingId };
}

const DA_REUNIAO = {
  id: true,
  title: true,
  startsAt: true,
  endsAt: true,
  status: true,
} as const;

/** O vendedor: entra pela sessão do CRM, e é host da própria reunião. */
async function pelaSessao(meetingId?: string): Promise<NaSala | Recusa> {
  if (!meetingId) return { erro: "Reunião não informada.", status: 400 };

  const user = await getSessionUser();
  if (!user) return { erro: "Não autenticado.", status: 401 };

  const reuniao = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: { ...DA_REUNIAO, ownerId: true },
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
  identidadeDita?: string,
): Promise<NaSala | Recusa> {
  const reuniao = await prisma.meeting.findUnique({
    where: { guestToken: token },
    select: DA_REUNIAO,
  });

  // Mesma resposta de um convite inválido: quem sonda não descobre quais
  // links existem testando.
  if (!reuniao) return { erro: "Link inválido ou expirado.", status: 404 };

  const nome = (nomeDigitado ?? "").trim().slice(0, 60) || "Convidado";

  return {
    reuniao,
    identidade: identidadeDoLink(identidadeDita),
    nome,
    host: false,
  };
}

/**
 * A identidade de quem chegou pelo link.
 *
 * Sem identidade dita, sorteia uma: o sufixo é aleatório por ENTRADA, não por
 * pessoa, porque o link é um só e pode ser aberto por várias — e identidade
 * repetida faz o LiveKit derrubar quem entrou antes.
 *
 * Com identidade dita, ela é ACEITA SE parecer uma identidade de convidado, e
 * descartada se não. O convidado precisa manter a mesma identidade entre a
 * entrada e as mensagens que escreve, e ele é o único que a conhece — não há
 * onde guardá-la do nosso lado, porque ele não tem conta nem inscrição. O que
 * NÃO pode é ele dizer `u_<id de alguém>` e escrever no chat como se fosse o
 * vendedor. Daí a peneira: o prefixo `c_` e nada além de hexadecimal.
 */
function identidadeDoLink(dita?: string): string {
  if (dita && /^c_[0-9a-f]{6,32}$/.test(dita)) return dita;
  return identidadeDeConvidado(randomBytes(6).toString("hex"));
}

/** O lead: entra pelo token do convite, e nunca é host. */
async function pelaConvite(token: string): Promise<NaSala | Recusa> {
  const convidado = await prisma.meetingAttendee.findUnique({
    where: { inviteToken: token },
    select: {
      id: true,
      leadId: true,
      status: true,
      firstOpenedAt: true,
      lead: { select: { name: true } },
      meeting: { select: DA_REUNIAO },
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
