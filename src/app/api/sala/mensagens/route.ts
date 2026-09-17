import type { NextRequest } from "next/server";

import { portaDoCorpo, quemEstaNaSala } from "@/lib/acesso-a-sala";
import { guardaDeTaxa } from "@/lib/limite-servidor";
import { LIMITE_DO_TEXTO, POR_SALA, saneiaMensagem } from "@/lib/mensagens-da-sala";
import { prisma } from "@/lib/prisma";

/**
 * A memória do chat da sala.
 *
 * A mensagem chega aos outros pelo canal de dados do LiveKit — instantâneo e
 * sem passar por nós. Esta rota é o que faz a conversa SOBREVIVER: ao fechar o
 * painel, ao recarregar a página, e principalmente a entrar no meio da sessão,
 * que é o caso que mais importa numa apresentação em grupo.
 *
 * Mesma autorização da rota de token, pelo mesmo módulo: quem pode entrar na
 * sala pode ler e escrever no chat dela, e ninguém mais.
 */
export const dynamic = "force-dynamic";

/** Histórico da conversa. */
export async function GET(request: NextRequest) {
  const barrado = await guardaDeTaxa("mensagens", request);
  if (barrado) return barrado;

  const busca = request.nextUrl.searchParams;
  // `identidade` e `nome` vão junto, e não são enfeite: quem chegou pelo LINK
  // não tem conta nem inscrição, então sem repetir a identidade que já recebeu
  // o servidor sorteia outra — e as próprias mensagens do histórico voltariam
  // como se fossem de outra pessoa.
  const quem = await quemEstaNaSala(
    portaDoCorpo({
      meetingId: busca.get("meetingId") ?? undefined,
      convite: busca.get("convite") ?? undefined,
      convidado: busca.get("convidado") ?? undefined,
      identidade: busca.get("identidade") ?? undefined,
      nome: busca.get("nome") ?? undefined,
    }),
  );
  if ("erro" in quem) return Response.json({ erro: quem.erro }, { status: quem.status });

  const mensagens = await prisma.roomMessage.findMany({
    where: { meetingId: quem.reuniao.id },
    orderBy: { createdAt: "asc" },
    // Teto: numa sessão de 40 pessoas o chat cresce, e quem entra atrasado não
    // precisa de duas horas de conversa para acompanhar o que está sendo dito.
    take: POR_SALA,
    select: { id: true, identity: true, autor: true, texto: true, createdAt: true },
  });

  return Response.json(
    {
      // A identidade de quem pergunta, para o cliente saber quais mensagens do
      // histórico são dele — sem isso, recarregar a página faz as próprias
      // mensagens voltarem como se fossem de outra pessoa.
      identidade: quem.identidade,
      mensagens: mensagens.map((m) => ({
        id: m.id,
        identidade: m.identity,
        autor: m.autor,
        texto: m.texto,
        em: m.createdAt.toISOString(),
      })),
    },
    { headers: { "cache-control": "no-store" } },
  );
}

/** Guarda uma mensagem. */
export async function POST(request: NextRequest) {
  const barrado = await guardaDeTaxa("mensagens", request);
  if (barrado) return barrado;

  let corpo: {
    meetingId?: string;
    convite?: string;
    convidado?: string;
    nome?: string;
    identidade?: string;
    texto?: string;
  };
  try {
    corpo = await request.json();
  } catch {
    return Response.json({ erro: "Corpo inválido." }, { status: 400 });
  }

  const texto = saneiaMensagem(corpo.texto ?? "");
  if (!texto) {
    return Response.json(
      { erro: `A mensagem precisa ter entre 1 e ${LIMITE_DO_TEXTO} caracteres.` },
      { status: 400 },
    );
  }

  const quem = await quemEstaNaSala(portaDoCorpo(corpo));
  if ("erro" in quem) return Response.json({ erro: quem.erro }, { status: quem.status });

  const gravada = await prisma.roomMessage.create({
    data: {
      meetingId: quem.reuniao.id,
      identity: quem.identidade,
      // O nome vem de quem AUTORIZOU, nunca do corpo: senão o lead escolhe
      // aparecer como o vendedor.
      autor: quem.nome,
      texto,
    },
    select: { id: true, createdAt: true },
  });

  return Response.json(
    {
      id: gravada.id,
      em: gravada.createdAt.toISOString(),
      identidade: quem.identidade,
      autor: quem.nome,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
