import "server-only";

import { DB_SCHEMA, prisma } from "@/lib/prisma";
import {
  avaliar,
  chaveDoBalde,
  quemPede,
  REGRAS,
  type NomeDaRegra,
  type Veredicto,
} from "@/lib/limite";

/**
 * Conta a requisição e decide se ela passa.
 *
 * Uma instrução só: `INSERT … ON CONFLICT DO UPDATE … RETURNING`. Ler e depois
 * escrever deixaria duas requisições simultâneas lerem o mesmo número e
 * passarem as duas — que é exatamente o cenário que um limite existe para
 * cobrir.
 *
 * **Falha ABERTO.** Se o banco não responder, a requisição passa. É uma
 * escolha, não descuido: este limite protege contra abuso, e derrubar o
 * agendamento inteiro porque o contador de abuso caiu troca um problema
 * pequeno por um grande. O erro vai para o log; a venda não para.
 */
export async function contarEDecidir(
  regra: NomeDaRegra,
  quem: string,
  agora = new Date(),
): Promise<Veredicto> {
  const { janelaSegundos } = REGRAS[regra];
  const chave = chaveDoBalde(regra, quem, agora, janelaSegundos);
  const expiraEm = new Date(
    (Math.floor(agora.getTime() / 1000 / janelaSegundos) + 1) * janelaSegundos * 1000,
  );

  try {
    const linhas = await prisma.$queryRawUnsafe<{ contagem: number }[]>(
      `INSERT INTO "${DB_SCHEMA}"."RateLimit" ("chave", "contagem", "expiraEm")
            VALUES ($1, 1, $2)
       ON CONFLICT ("chave")
       DO UPDATE SET "contagem" = "RateLimit"."contagem" + 1
         RETURNING "contagem"`,
      chave,
      expiraEm,
    );
    return avaliar(linhas[0]?.contagem ?? 1, REGRAS[regra], agora);
  } catch (erro) {
    console.error("[limite] contador indisponível, deixando passar:", erro);
    return { permitido: true, restantes: REGRAS[regra].teto, esperarSegundos: 0 };
  }
}

/**
 * A resposta de quem passou do teto.
 *
 * 429 com `Retry-After` porque é o que um cliente educado sabe ler — e o texto
 * diz o que fazer, não só que deu errado.
 */
export function respostaDeExcesso(veredicto: Veredicto, regra: NomeDaRegra) {
  return Response.json(
    {
      erro: "Muitas requisições em pouco tempo. Tente de novo em instantes.",
      esperarSegundos: veredicto.esperarSegundos,
    },
    {
      status: 429,
      headers: {
        "retry-after": String(veredicto.esperarSegundos),
        "x-ratelimit-limit": String(REGRAS[regra].teto),
        "x-ratelimit-remaining": "0",
        "cache-control": "no-store",
      },
    },
  );
}

/**
 * Guarda pronta para uma rota: conta pelo IP e devolve a resposta de 429, ou
 * `null` para seguir.
 */
export async function guardaDeTaxa(
  regra: NomeDaRegra,
  request: Request,
  agora = new Date(),
): Promise<Response | null> {
  const veredicto = await contarEDecidir(
    regra,
    quemPede(request.headers.get("x-forwarded-for")),
    agora,
  );
  return veredicto.permitido ? null : respostaDeExcesso(veredicto, regra);
}

/**
 * Faxina das janelas vencidas.
 *
 * Oportunista, chamada pelo cron que já roda — sem isto a tabela cresce uma
 * linha por IP por minuto e nunca encolhe. Não precisa ser pontual: linha
 * vencida não afeta contagem nenhuma, só ocupa espaço.
 */
export async function limparBaldesVencidos(agora = new Date()) {
  const { count } = await prisma.rateLimit.deleteMany({
    where: { expiraEm: { lt: new Date(agora.getTime() - 60_000) } },
  });
  return count;
}
