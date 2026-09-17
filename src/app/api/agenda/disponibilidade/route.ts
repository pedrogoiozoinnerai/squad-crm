import type { NextRequest } from "next/server";

import { instanteDeCampoLocal, TZ } from "@/lib/dates";
import { horizonteDaAgenda } from "@/lib/horizonte";
import { guardaDeTaxa } from "@/lib/limite-servidor";
import { sessoesComVaga } from "@/lib/sessoes";

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

/**
 * Um recorte opcional de dias, se o chamador pedir.
 *
 * Valor torto é IGNORADO, não vira 400: este endereço é público e uma query
 * string estragada não pode virar tela de erro no meio do funil.
 */
function recorte(request: NextRequest): { de?: Date; ate?: Date } {
  const p = request.nextUrl.searchParams;
  const pedido = (nome: string, hora: string) => {
    const bruto = p.get(nome);
    if (!bruto) return null;
    return instanteDeCampoLocal(`${bruto}T${hora}`);
  };
  // Quem estreita de verdade é `sessoesComVaga`; aqui só se lê o pedido.
  return { de: pedido("de", "00:00") ?? undefined, ate: pedido("ate", "23:59") ?? undefined };
}

export async function GET(request: NextRequest) {
  // O cabeçalho de cache já faz o CDN absorver a maior parte — mas a chave de
  // cache inclui a query string, então `?x=1`, `?x=2`… fura o cache e bate
  // aqui. O limite é o que sobra quando o cache é contornado de propósito.
  const barrado = await guardaDeTaxa("disponibilidade", request);
  if (barrado) return barrado;

  const agora = new Date();
  const janela = recorte(request);

  // A consulta mora em `lib/sessoes`, junto de `remarcar`, que precisa da MESMA
  // lista: mostrar aqui uma sessão que a remarcação recusaria seria oferecer um
  // horário que não existe.
  const comVaga = await sessoesComVaga(agora, janela);
  const ate = janela.ate && janela.ate < horizonteDaAgenda(agora)
    ? janela.ate
    : horizonteDaAgenda(agora);

  return Response.json(
    {
      timezone: TZ,
      /// Até quando a agenda vai. O funil pode dizer "aberta até 31 de
      /// outubro" em vez de deixar a pessoa rolar procurando o fim.
      horizonteAte: ate.toISOString(),
      sessoes: comVaga.map((s) => ({ ...s, inicioEm: s.inicioEm.toISOString() })),
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
