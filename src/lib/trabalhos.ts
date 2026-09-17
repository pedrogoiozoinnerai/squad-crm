import "server-only";

import {
  ARRENDAMENTO_MS,
  backoff,
  chaveDoTrabalho,
  desistir,
  ESPERA_MAX_MS,
  MAX_TENTATIVAS,
  type EtapaDoTrabalho,
} from "@/lib/fila";
import { DB_SCHEMA, prisma } from "@/lib/prisma";

/**
 * A fila, do lado do banco.
 *
 * Duas regras moram aqui e nenhuma delas é sobre desempenho.
 *
 * **Semeadura por derivação.** Ninguém empurra trabalho para dentro da fila —
 * nem o webhook, nem a tela. Perguntamos ao banco "que gravação completa não
 * tem transcrição?" e criamos o que falta. É a forma de `reconciliarPresencas`,
 * e é o que faz callback perdido, webhook que não chegou e deploy no meio da
 * call se consertarem sozinhos na execução seguinte.
 *
 * **Toda aritmética de tempo é do Postgres.** Nenhum `Date` do JavaScript entra
 * como parâmetro de data aqui: o `pg` serializa `Date` no fuso do PROCESSO, e
 * numa coluna `timestamp without time zone` isso já fez uma sala nascer "três
 * horas no passado" e um relatório acusar uma correção de não ter pego. `now()`
 * e `make_interval` não têm esse problema.
 */

export type TrabalhoArrendado = {
  id: string;
  chave: string;
  etapa: string;
  tentativas: number;
  externoId: string | null;
};

/**
 * Cria os trabalhos que o estado do banco pede.
 *
 * `ON CONFLICT DO NOTHING` na chave de negócio: dois crons sobrepostos, ou o
 * cron e um botão de "tentar de novo", criam UM trabalho — não dois pedidos
 * pagos ao mesmo provedor pelo mesmo áudio.
 */
export async function semearTranscricoes(): Promise<number> {
  const linhas = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO "${DB_SCHEMA}"."AiJob" ("id","chave","etapa","estado","createdAt","updatedAt")
     SELECT gen_random_uuid()::text, 'TRANSCREVER:' || r.id, 'TRANSCREVER', 'PENDENTE', now(), now()
       FROM "${DB_SCHEMA}"."Recording" r
       LEFT JOIN "${DB_SCHEMA}"."Transcript" t ON t."recordingId" = r.id
      WHERE r.status = 'COMPLETA'
        AND r.caminho IS NOT NULL
        AND r."apagadaEm" IS NULL
        AND t.id IS NULL
     ON CONFLICT ("chave") DO NOTHING
     RETURNING id`,
  );
  return linhas.length;
}

/**
 * Pega trabalhos para executar agora.
 *
 * `FOR UPDATE SKIP LOCKED` é o que permite duas execuções simultâneas sem
 * pegarem o mesmo item: a segunda PULA o que a primeira travou, em vez de
 * esperar. É o mesmo mecanismo que `lib/limite-servidor` já usa para o contador
 * de requisições, e aqui o erro custa mais — mandar o mesmo áudio de uma hora
 * duas vezes é uma fatura, não um contador errado.
 */
export async function arrendar(
  etapa: EtapaDoTrabalho,
  limite: number,
): Promise<TrabalhoArrendado[]> {
  return prisma.$queryRawUnsafe<TrabalhoArrendado[]>(
    `UPDATE "${DB_SCHEMA}"."AiJob"
        SET estado = 'ARRENDADO',
            "arrendadoAte" = now() + make_interval(secs => $2),
            "updatedAt" = now()
      WHERE id IN (
        SELECT id FROM "${DB_SCHEMA}"."AiJob"
         WHERE etapa = $1
           AND estado = 'PENDENTE'
           AND tentativas < $3
           AND ("proximaTentativaEm" IS NULL OR "proximaTentativaEm" <= now())
           AND ("arrendadoAte" IS NULL OR "arrendadoAte" <= now())
         ORDER BY "createdAt"
           FOR UPDATE SKIP LOCKED
         LIMIT $4
      )
      RETURNING id, chave, etapa, tentativas, "externoId"`,
    etapa,
    ARRENDAMENTO_MS / 1000,
    MAX_TENTATIVAS,
    limite,
  );
}

/** O trabalho foi entregue ao provedor; agora é esperar o retorno. */
export async function aguardando(id: string, externoId: string) {
  await prisma.aiJob.update({
    where: { id },
    data: { estado: "AGUARDANDO", externoId, arrendadoAte: null, erro: null },
  });
}

export async function concluir(id: string) {
  await prisma.aiJob.update({
    where: { id },
    data: { estado: "PRONTO", arrendadoAte: null, erro: null },
  });
}

/**
 * Falhou: conta a tentativa e marca quando tentar de novo.
 *
 * O `backoff` é calculado em JS (é função pura e testada) mas aplicado como
 * INTERVALO no Postgres, pelo motivo do cabeçalho deste arquivo.
 */
export async function falhar(id: string, tentativas: number, erro: string) {
  const proximas = tentativas + 1;
  await prisma.$executeRawUnsafe(
    `UPDATE "${DB_SCHEMA}"."AiJob"
        SET estado = $2,
            tentativas = $3,
            "arrendadoAte" = NULL,
            "proximaTentativaEm" = now() + make_interval(secs => $4),
            erro = $5,
            "updatedAt" = now()
      WHERE id = $1`,
    id,
    desistir(proximas) ? "DESISTIU" : "PENDENTE",
    proximas,
    backoff(proximas) / 1000,
    erro.slice(0, 500),
  );
}

/**
 * Devolve à fila o que o provedor nunca respondeu.
 *
 * Callback perdido não dá erro em lugar nenhum: sem este passo, o trabalho fica
 * `AGUARDANDO` para sempre, a gravação nunca tem transcrição, e nada em lugar
 * nenhum diz por quê. É o tipo de silêncio que só aparece quando alguém
 * pergunta "cadê o resumo daquela call de três semanas atrás?".
 */
export async function soltarEsquecidos(): Promise<number> {
  return prisma.$executeRawUnsafe(
    `UPDATE "${DB_SCHEMA}"."AiJob"
        SET estado = CASE WHEN tentativas + 1 >= $2 THEN 'DESISTIU' ELSE 'PENDENTE' END,
            tentativas = tentativas + 1,
            "externoId" = NULL,
            "arrendadoAte" = NULL,
            erro = 'o provedor não respondeu no prazo',
            "updatedAt" = now()
      WHERE estado = 'AGUARDANDO'
        AND "updatedAt" < now() - make_interval(secs => $1)`,
    ESPERA_MAX_MS / 1000,
    MAX_TENTATIVAS,
  );
}

/** O trabalho que um retorno diz respeito, se ele ainda estiver esperando. */
export async function trabalhoEsperando(id: string) {
  return prisma.aiJob.findFirst({
    where: { id, estado: "AGUARDANDO" },
    select: { id: true, chave: true, etapa: true, externoId: true, tentativas: true },
  });
}

/** `TRANSCREVER:rec_123` → `rec_123`. */
export function alvoDaChave(chave: string): string {
  return chave.slice(chave.indexOf(":") + 1);
}

export { chaveDoTrabalho };
