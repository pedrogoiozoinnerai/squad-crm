import { config } from "dotenv";

import { Client } from "pg";

config({ path: ".env", quiet: true });
config({ path: ".env.local", override: true, quiet: true });

/**
 * A série de apresentação, e a agenda cheia a partir dela.
 *
 * Segunda a sábado, 13 horários por dia — 08:00 às 20:00, hora de São Paulo —,
 * uma hora cada, 20 vagas. Domingo fica de fora.
 *
 * Existe como script e não como clique na tela por um motivo só: a tela cria a
 * série, e criar a série é a parte fácil. O que precisa ser CONFERIDO é o que
 * saiu do materializador — se os instantes caem mesmo em 08:00 de São Paulo e
 * não às 05:00 por causa do fuso do runner. Por isso a verificação no fim lê
 * as linhas de volta convertidas para o fuso, em vez de confiar na escrita.
 *
 * Idempotente: a série é encontrada pelo nome e o materializador tem
 * `@@unique([templateId, startsAt])`. Rodar de novo não duplica nada.
 *
 *   npm run agenda:gerar                → crm_dev
 *   npm run agenda:gerar -- --producao  → crm
 *
 * Sem `--producao` escreve em `crm_dev`, de propósito: a mesma execução, com a
 * mesma conferência, prova o resultado antes de qualquer linha entrar em
 * produção.
 *
 * O `NODE_OPTIONS=--conditions=react-server` do script do npm não é enfeite:
 * `lib/sessoes` começa com `import "server-only"`, e sem essa condição o
 * pacote resolve para a versão que existe só para explodir num bundle de
 * cliente. É a mesma condição que o Next usa ao montar o servidor.
 *
 * **O que este script NÃO faz:** mexer em sessão já materializada. O
 * materializador cria o que falta e nada mais, então mudar `durationMin` ou
 * `capacity` depois vale para as sessões seguintes, não para as que já estão
 * na agenda. Trocar a lotação do mês em curso é outra operação.
 */

const NOME = "Apresentação Squad";
const WEEKDAYS = "1,2,3,4,5,6";
const TIMES = Array.from({ length: 13 }, (_, i) => `${String(8 + i).padStart(2, "0")}:00`).join(",");
const DURACAO = 60;
const LOTACAO = 20;

const SCHEMA = process.argv.includes("--producao") ? "crm" : "crm_dev";

// ANTES de qualquer import que toque o Prisma: `DB_SCHEMA` é lido na avaliação
// do módulo `lib/prisma`, não na primeira consulta.
process.env.DB_SCHEMA = SCHEMA;

async function main() {
  const c = new Client({ connectionString: process.env.DIRECT_URL });
  await c.connect();

  const dono = await c.query<{ id: string; name: string }>(
    `select id, name from "${SCHEMA}"."User"
      where "claimedAt" is not null and role = 'ADMIN' and active
      order by "createdAt" limit 1`,
  );
  if (!dono.rowCount) {
    throw new Error(`Nenhuma conta ADMIN assumida em ${SCHEMA} para ser dona da série.`);
  }
  const ownerId = dono.rows[0].id;
  console.log(`dono da série: ${dono.rows[0].name}`);

  const existente = await c.query<{ id: string }>(
    `select id from "${SCHEMA}"."SessionTemplate" where name = $1`,
    [NOME],
  );

  if (existente.rowCount) {
    await c.query(
      `update "${SCHEMA}"."SessionTemplate"
          set weekdays = $1, times = $2, "durationMin" = $3, capacity = $4,
              timezone = 'America/Sao_Paulo', horizonte = 'FIM_DO_MES', active = true
        where id = $5`,
      [WEEKDAYS, TIMES, DURACAO, LOTACAO, existente.rows[0].id],
    );
    console.log(`série atualizada (${existente.rows[0].id})`);
  } else {
    const nova = await c.query<{ id: string }>(
      `insert into "${SCHEMA}"."SessionTemplate"
         (id, name, weekdays, times, "durationMin", capacity, active, "createdAt",
          timezone, horizonte, "horizonDias", "ownerId")
       values (gen_random_uuid()::text, $1, $2, $3, $4, $5, true, now(),
               'America/Sao_Paulo', 'FIM_DO_MES', 28, $6)
       returning id`,
      [NOME, WEEKDAYS, TIMES, DURACAO, LOTACAO, ownerId],
    );
    console.log(`série criada (${nova.rows[0].id})`);
  }

  const { materializarSessoes } = await import("../src/lib/sessoes");
  const r = await materializarSessoes();
  console.log("materialização:", JSON.stringify(r));

  // ── A conferência ────────────────────────────────────────────────────────
  // Lida de volta do banco e convertida para o fuso: a coluna é
  // `timestamp without time zone` guardando hora UTC, então `at time zone
  // 'UTC' at time zone 'America/Sao_Paulo'` é o que devolve a hora de parede
  // que o lead vai ver.
  const daSerie = `type = 'GROUP' and "templateId" is not null and "startsAt" > now()`;
  const local = `("startsAt" at time zone 'UTC' at time zone 'America/Sao_Paulo')`;

  const grade = await c.query<{ hora: string; quantas: number }>(
    `select to_char(${local}, 'HH24:MI') hora, count(*)::int quantas
       from "${SCHEMA}"."Meeting" where ${daSerie} group by 1 order by 1`,
  );
  console.log("\nhorários (hora de São Paulo):");
  for (const l of grade.rows) console.log(`  ${l.hora}  ${l.quantas}`);

  const semana = await c.query<{ dia: string; quantas: number }>(
    `select to_char(${local}, 'ID') dia, count(*)::int quantas
       from "${SCHEMA}"."Meeting" where ${daSerie} group by 1 order by 1`,
  );
  const nomes = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];
  console.log("\ndias da semana:");
  for (const l of semana.rows) console.log(`  ${nomes[Number(l.dia) - 1]}  ${l.quantas}`);

  const total = await c.query(
    `select count(*)::int total, sum(capacity)::int vagas,
            to_char(min(${local}), 'YYYY-MM-DD HH24:MI') primeira,
            to_char(max(${local}), 'YYYY-MM-DD HH24:MI') ultima
       from "${SCHEMA}"."Meeting" where ${daSerie}`,
  );
  console.log("\ntotal:", JSON.stringify(total.rows[0]));

  const semLink = await c.query(
    `select count(*)::int from "${SCHEMA}"."Meeting" where ${daSerie} and "guestToken" is null`,
  );
  console.log(`sessões sem link de convite: ${semLink.rows[0].count}`);

  await c.end();
}

main().catch((e) => {
  console.error("\n✗", e instanceof Error ? e.message : e);
  process.exit(1);
});
