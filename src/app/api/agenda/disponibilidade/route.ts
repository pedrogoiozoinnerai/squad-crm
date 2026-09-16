import type { NextRequest } from "next/server";

import { instanteDeCampoLocal, TZ } from "@/lib/dates";
import { horizonteDaAgenda } from "@/lib/horizonte";
import { guardaDeTaxa } from "@/lib/limite-servidor";
import { prisma } from "@/lib/prisma";

/**
 * As sessões com vaga, para quem está agendando de fora.
 *
 * É o que o funil do Type mostra no lugar do calendário do Cal.com. Não pede
 * chave: só devolve dia, hora e quantas vagas restam — nenhum nome, nenhum
 * e-mail, nada que já não esteja na tela de quem vai agendar.
 *
 * Reservar, isso sim, exige chave. Ler não muda nada; escrever muda.
 */
export const dynamic = "force-dynamic";

/// Quanto tempo antes do início a sessão para de aceitar inscrição.
///
/// Uma hora: o lead que termina o funil de manhã consegue entrar numa sessão
/// ainda hoje, e é isso que se quer — marcar para daqui a três dias é perder a
/// pessoa no auge do interesse.
///
/// Não menos que isso porque a hora que sobra é o que o time usa: a sala abre
/// 30 minutos antes (`ABRE_ANTES_MIN`), a confirmação precisa chegar ao
/// WhatsApp e o closer precisa ver o nome na agenda antes de entrar. Quinze
/// minutos deixavam alguém se inscrever para uma sala que abriria em quinze —
/// ninguém do lado de cá ficava sabendo a tempo.
const ANTECEDENCIA_MIN = 60;

/// Teto de linhas. Não é o corte esperado: fica logo acima do que uma série
/// materializa num mês (650), para uma configuração errada não virar um JSON
/// de megabytes num endereço público.
const TETO_SESSOES = 700;

/**
 * Um recorte opcional de dias, se o chamador pedir.
 *
 * Valor torto é IGNORADO, não vira 400: este endereço é público e uma query
 * string estragada não pode virar tela de erro no meio do funil.
 */
function recorte(request: NextRequest, de: Date, ate: Date) {
  const p = request.nextUrl.searchParams;
  const pedido = (nome: string, hora: string) => {
    const bruto = p.get(nome);
    if (!bruto) return null;
    return instanteDeCampoLocal(`${bruto}T${hora}`);
  };
  const deP = pedido("de", "00:00");
  const ateP = pedido("ate", "23:59");
  return {
    // Nunca alarga a janela: o recorte só pode estreitar o que a agenda abre.
    de: deP && deP > de ? deP : de,
    ate: ateP && ateP < ate ? ateP : ate,
  };
}

export async function GET(request: NextRequest) {
  // O cabeçalho de cache já faz o CDN absorver a maior parte — mas a chave de
  // cache inclui a query string, então `?x=1`, `?x=2`… fura o cache e bate
  // aqui. O limite é o que sobra quando o cache é contornado de propósito.
  const barrado = await guardaDeTaxa("disponibilidade", request);
  if (barrado) return barrado;

  const agora = new Date();
  const janela = recorte(
    request,
    new Date(agora.getTime() + ANTECEDENCIA_MIN * 60_000),
    // A MESMA função que o materializador usa. Duas regras foi o que fez a
    // rota mostrar 21 dias enquanto a série enchia 28.
    horizonteDaAgenda(agora),
  );

  const sessoes =
    janela.ate <= janela.de
      ? []
      : await prisma.meeting.findMany({
          where: {
            type: "GROUP",
            status: "SCHEDULED",
            startsAt: { gte: janela.de, lte: janela.ate },
            capacity: { not: null },
          },
          orderBy: { startsAt: "asc" },
          take: TETO_SESSOES,
          select: {
            id: true,
            startsAt: true,
            endsAt: true,
            capacity: true,
            _count: {
              select: { attendees: { where: { status: { in: ["INSCRITO", "CONFIRMADO"] } } } },
            },
          },
        });

  const comVaga = sessoes
    .map((s) => ({
      id: s.id,
      inicioEm: s.startsAt.toISOString(),
      duracaoMin: Math.round((s.endsAt.getTime() - s.startsAt.getTime()) / 60_000),
      lotacao: s.capacity ?? 0,
      inscritos: s._count.attendees,
      vagas: Math.max(0, (s.capacity ?? 0) - s._count.attendees),
    }))
    .filter((s) => s.vagas > 0);

  return Response.json(
    {
      timezone: TZ,
      /// Até quando a agenda vai. O funil pode dizer "aberta até 31 de
      /// outubro" em vez de deixar a pessoa rolar procurando o fim.
      horizonteAte: janela.ate.toISOString(),
      sessoes: comVaga,
    },
    {
      headers: {
        // `max-age` sozinho é só do navegador — e o funil consulta do SERVIDOR
        // dele, com `no-store`. Na prática toda carga de tela do funil batia no
        // banco, num endereço sem autenticação nem limite de taxa. `s-maxage`
        // põe o CDN da Vercel na frente; `stale-while-revalidate` evita que a
        // expiração do cache vire uma rajada simultânea.
        "cache-control": "public, max-age=30, s-maxage=30, stale-while-revalidate=60",
      },
    },
  );
}
