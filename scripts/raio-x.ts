import { config } from "dotenv";

import { Client } from "pg";

config({ path: ".env", quiet: true });
config({ path: ".env.local", override: true, quiet: true });

/**
 * O estado de produção, medido — não lembrado.
 *
 * Existe porque plano feito de memória envelhece em dias: o que estava quebrado
 * na semana passada pode ter sido corrigido, e o que estava de pé pode ter
 * caído. Este script só LÊ, e imprime os números que decidem prioridade.
 *
 *   npm run raio-x
 */

const SCHEMA = "crm";
const FUNIL = "type";

async function main() {
  const c = new Client({ connectionString: process.env.DIRECT_URL });
  await c.connect();
  const q = async (sql: string) => (await c.query(sql)).rows;

  const linha = (rotulo: string, valor: unknown, nota = "") =>
    console.log(`  ${rotulo.padEnd(38)} ${String(valor).padStart(8)}  ${nota}`);

  console.log("\n══ Quem atende o lead ══════════════════════════════════════");
  const contas = await q(`
    select role::text papel, count(*)::int total,
           count(*) filter (where "claimedAt" is not null)::int assumidas
      from "${SCHEMA}"."User" where active group by role order by role`);
  for (const r of contas) {
    linha(`contas ${r.papel} ativas`, r.total, `${r.assumidas} assumidas`);
  }
  const rodizio = await q(`
    select count(*)::int from "${SCHEMA}"."User"
     where active and "claimedAt" is not null and role = 'USER'`);
  linha("vendedores no rodízio", rodizio[0].count, rodizio[0].count === 0 ? "⚠ tudo cai numa conta só" : "");

  console.log("\n══ A agenda que o lead vê ══════════════════════════════════");
  const agenda = await q(`
    select count(*)::int sessoes, coalesce(sum(capacity),0)::int vagas,
           to_char(min("startsAt" at time zone 'UTC' at time zone 'America/Sao_Paulo'), 'DD/MM HH24:MI') primeira,
           to_char(max("startsAt" at time zone 'UTC' at time zone 'America/Sao_Paulo'), 'DD/MM HH24:MI') ultima
      from "${SCHEMA}"."Meeting"
     where type='GROUP' and "templateId" is not null and "startsAt" > now() and status='SCHEDULED'`);
  linha("sessões futuras", agenda[0].sessoes);
  linha("vagas somadas", agenda[0].vagas);
  linha("da primeira à última", `${agenda[0].primeira ?? "—"}`, `até ${agenda[0].ultima ?? "—"}`);

  const inscritos = await q(`
    select count(*)::int from "${SCHEMA}"."MeetingAttendee" a
      join "${SCHEMA}"."Meeting" m on m.id = a."meetingId"
     where m."startsAt" > now() and a.status in ('INSCRITO','CONFIRMADO')`);
  linha("inscritos para o futuro", inscritos[0].count);

  console.log("\n══ O funil ═════════════════════════════════════════════════");
  const funil = await q(`
    select count(*)::int total,
           count(*) filter (where status::text = 'COMPLETED')::int concluidos,
           count(*) filter (where "crmMeetingId" is not null)::int agendados,
           count(*) filter (where fbclid is not null or gclid is not null)::int com_clique,
           count(*) filter (where "createdAt" > now() - interval '7 days')::int semana
      from "${FUNIL}"."Lead"`);
  const f = funil[0];
  linha("leads no funil", f.total, `${f.semana} nos últimos 7 dias`);
  linha("concluíram o questionário", f.concluidos);
  linha("agendaram de fato", f.agendados);
  linha("com fbclid/gclid guardado", f.com_clique, "⚠ nunca enviados de volta ao Meta");

  console.log("\n══ A ponte funil → CRM ═════════════════════════════════════");
  const orfaos = await q(`
    select count(*)::int from "${FUNIL}"."Lead" l
     where l.status::text = 'COMPLETED' and l."crmMeetingId" is null`);
  linha("concluíram e NÃO viraram reunião", orfaos[0].count, orfaos[0].count ? "⚠ lead perdido na costura" : "");

  const semCrm = await q(`
    select count(*)::int from "${FUNIL}"."Lead" l
     where l."crmMeetingId" is not null
       and not exists (select 1 from "${SCHEMA}"."Lead" c where c."typeSessionId" = l."sessionId")`);
  linha("agendaram e não existem no CRM", semCrm[0].count, semCrm[0].count ? "⚠ sincronização com buraco" : "");

  const marca = await q(`select "funilSincronizadoAte" from "${SCHEMA}"."Config" limit 1`);
  linha("marca d'água do sync", marca[0]?.funilSincronizadoAte ?? "nunca rodou");

  console.log("\n══ O que o vendedor recebe ═════════════════════════════════");
  const reunioes = await q(`
    select count(*)::int from "${SCHEMA}"."Meeting"
     where "startsAt" > now() and status='SCHEDULED' and "guestToken" is null`);
  linha("reuniões futuras sem link", reunioes[0].count, reunioes[0].count ? "⚠ sem link para mandar" : "");

  const semDono = await q(`
    select count(*)::int from "${SCHEMA}"."Lead" where "ownerId" is null`);
  linha("leads sem dono", semDono[0].count);

  console.log("\n══ Avisos ao lead ══════════════════════════════════════════");
  const fila = await q(`
    select count(*)::int from information_schema.tables
     where table_schema='${SCHEMA}' and table_name='SendQueue'`);
  linha("tabela de fila de mensagens", fila[0].count ? "existe" : "ausente");
  const naFila = fila[0].count
    ? await q(`select count(*)::int from "${SCHEMA}"."SendQueue"`)
    : [{ count: 0 }];
  linha("mensagens já enfileiradas", naFila[0].count, naFila[0].count === 0 ? "⚠ ninguém avisa o lead" : "");

  console.log("\n══ Erros recentes ══════════════════════════════════════════");
  const erros = await q(`
    select count(*)::int total,
           count(*) filter (where "createdAt" > now() - interval '24 hours')::int dia
      from "${SCHEMA}"."ErrorLog"`);
  linha("no log de erros", erros[0].total, `${erros[0].dia} nas últimas 24h`);

  const ultimos = await q(`
    select "createdAt", left(coalesce(message, ''), 70) msg
      from "${SCHEMA}"."ErrorLog" order by "createdAt" desc limit 5`);
  for (const e of ultimos) {
    console.log(`     ${new Date(e.createdAt).toISOString().slice(0, 16)}  ${e.msg}`);
  }

  console.log();
  await c.end();
}

main().catch((e) => {
  console.error("\n✗", e instanceof Error ? e.message : e, "\n");
  process.exit(1);
});
