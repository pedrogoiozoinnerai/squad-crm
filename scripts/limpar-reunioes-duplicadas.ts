import { config } from "dotenv";

import { Client } from "pg";

config({ path: ".env", quiet: true });
config({ path: ".env.local", override: true, quiet: true });

/**
 * Limpa as reuniões duplicadas que o sync criou antes da correção.
 *
 * O defeito: a busca pela reunião existente exigia `calBookingUid`, e reserva
 * feita pela nossa agenda tem uid nulo. O sync não achava nada e criava outra
 * reunião a cada execução — seis por hora, para sempre. A correção está em
 * `lib/sync-reuniao`; isto aqui é o estrago que ficou.
 *
 * **Cancela, não apaga.** `status = CANCELED` é como o próprio domínio diz "isto
 * não vai acontecer": some da agenda do vendedor, some das contagens, e é
 * reversível com um UPDATE se o critério estiver errado. Apagar linha de
 * produção por causa de um defeito recém-descoberto é a hora errada de ser
 * irreversível — e já aconteceu nesta base um filtro largo demais levar junto o
 * que não devia.
 *
 * O critério é estreito de propósito, e cada cláusula exclui um jeito de errar:
 *
 * - `type = 'ONE_ON_ONE'` — sessão coletiva nunca veio deste caminho;
 * - `calBookingUid IS NULL` — reunião do Cal.com é legítima e fica;
 * - o lead tem `crmMeetingId` no funil — ou seja, ele agendou pela NOSSA
 *   agenda, e portanto esta 1:1 não deveria existir;
 * - `m.id <> crmMeetingId` — nunca toca a reunião de verdade;
 * - sem `Presence` e sem `RoomEvent` — se alguém entrou nela, não é lixo,
 *   é história, e história não se apaga.
 *
 *   npm run limpar:duplicadas -- --producao
 *   npm run limpar:duplicadas                 (só conta, não muda nada)
 */

const SCHEMA = process.argv.includes("--producao") ? "crm" : "crm_dev";
const FUNIL = SCHEMA === "crm" ? "type" : "type_dev";
const VALENDO = process.argv.includes("--valendo");

const CRITERIO = `
    from "${SCHEMA}"."Meeting" m
    join "${SCHEMA}"."Lead" l on l.id = m."leadId"
    join "${FUNIL}"."Lead" f on f."sessionId" = l."typeSessionId"
   where m.type = 'ONE_ON_ONE'
     and m."calBookingUid" is null
     and m.status <> 'CANCELED'
     and f."crmMeetingId" is not null
     and m.id <> f."crmMeetingId"
     and not exists (select 1 from "${SCHEMA}"."Presence" p where p."meetingId" = m.id)
     and not exists (select 1 from "${SCHEMA}"."RoomEvent" e where e."meetingId" = m.id)`;

async function main() {
  const c = new Client({ connectionString: process.env.DIRECT_URL });
  await c.connect();

  const alvo = await c.query<{ id: string; title: string; startsAt: Date }>(
    `select m.id, m.title, m."startsAt" ${CRITERIO} order by m."createdAt"`,
  );

  console.log(`\nschema ${SCHEMA} · ${alvo.rowCount} reuniões duplicadas\n`);
  for (const m of alvo.rows.slice(0, 5)) {
    console.log(`  ${m.id}  ${m.title}`);
  }
  if ((alvo.rowCount ?? 0) > 5) console.log(`  … e mais ${(alvo.rowCount ?? 0) - 5}`);

  if (!alvo.rowCount) {
    await c.end();
    return;
  }

  if (!VALENDO) {
    console.log("\n  (nada foi alterado — acrescente --valendo para cancelar)\n");
    await c.end();
    return;
  }

  const ids = alvo.rows.map((m) => m.id);

  // As inscrições primeiro: uma reunião cancelada com inscrito ativo ainda
  // aparece nas contagens de "quem vem".
  const inscricoes = await c.query(
    `update "${SCHEMA}"."MeetingAttendee" set status = 'CANCELADO'
      where "meetingId" = any($1::text[]) and status <> 'CANCELADO'`,
    [ids],
  );
  const reunioes = await c.query(
    `update "${SCHEMA}"."Meeting" set status = 'CANCELED', "updatedAt" = now()
      where id = any($1::text[])`,
    [ids],
  );

  console.log(
    `\n✓ ${reunioes.rowCount} reuniões canceladas, ${inscricoes.rowCount} inscrições encerradas.`,
  );
  console.log("  Reversível: as linhas continuam lá, só mudaram de status.\n");
  await c.end();
}

main().catch((e) => {
  console.error("\n✗", e instanceof Error ? e.message : e, "\n");
  process.exit(1);
});
