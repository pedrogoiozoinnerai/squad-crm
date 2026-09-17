import { config } from "dotenv";

import { Client } from "pg";

config({ path: ".env", quiet: true });
config({ path: ".env.local", override: true, quiet: true });

/**
 * As perguntas que o banco responde e nenhum teste faz.
 *
 * Um teste prova que a função está certa para a entrada que eu imaginei. Esta
 * varredura pergunta outra coisa: o que existe lá dentro AGORA é coerente? Foi
 * assim que apareceram os dois defeitos mais caros da última rodada — as 15
 * reuniões do funil sem link de convite, e a sala de 45 minutos com 322 e 366
 * minutos de presença —, nenhum dos quais quebrava nada, tinha log ou derrubava
 * teste. Eles só existiam.
 *
 * **Só lê.** Nenhum `insert`, `update` ou `delete`, de propósito: é o que
 * permite rodar contra produção sem pedir permissão a ninguém.
 *
 *   npm run coerencia
 *
 * Sai com 1 se alguma checagem achou algo, para servir de portão.
 */

const SCHEMA = process.env.DB_SCHEMA ?? "crm";
const db = new Client({ connectionString: process.env.DIRECT_URL });

let comAchado = 0;
let checadas = 0;

function q(sql: string) {
  return sql.replaceAll("{s}", `"${SCHEMA}"`);
}

/**
 * Uma checagem.
 *
 * `porque` não é enfeite: a varredura é feita para ser lida por quem não estava
 * aqui quando o defeito foi achado, e um número sem a frase que explica o que
 * ele custa vira ruído que todo mundo aprende a ignorar.
 */
async function checar(
  titulo: string,
  porque: string,
  sql: string,
  amostra?: (linha: Record<string, unknown>) => string,
) {
  checadas++;
  let linhas: Record<string, unknown>[];
  try {
    linhas = (await db.query(q(sql))).rows;
  } catch (erro) {
    comAchado++;
    console.log(`  ⚠ ${titulo} — a consulta falhou: ${erro instanceof Error ? erro.message : erro}`);
    return;
  }

  if (linhas.length === 0) {
    console.log(`  ✓ ${titulo}`);
    return;
  }

  comAchado++;
  console.log(`  ✗ ${titulo} — ${linhas.length}`);
  console.log(`      ${porque}`);
  if (amostra) {
    for (const linha of linhas.slice(0, 3)) console.log(`      · ${amostra(linha)}`);
    if (linhas.length > 3) console.log(`      · … e mais ${linhas.length - 3}`);
  }
}

/**
 * A data como ela está GRAVADA, sem deslocar.
 *
 * As colunas são `timestamp without time zone`, e o `pg` monta o `Date` lendo o
 * valor cru no fuso do PROCESSO. `toISOString()` depois disso soma as três
 * horas de volta e imprime 00:10 onde o banco tem 21:10 — o mesmo erro que esta
 * varredura existe para achar, cometido pela varredura. Pelos getters locais o
 * relógio impresso é o relógio armazenado, rode onde rodar.
 */
function quando(valor: unknown): string {
  if (!(valor instanceof Date)) return String(valor);
  const dd = (n: number) => String(n).padStart(2, "0");
  return (
    `${valor.getFullYear()}-${dd(valor.getMonth() + 1)}-${dd(valor.getDate())} ` +
    `${dd(valor.getHours())}:${dd(valor.getMinutes())}`
  );
}

function secao(titulo: string) {
  console.log(`\n${titulo}`);
}

async function main() {
  await db.connect();
  console.log(`Coerência de ${SCHEMA} — só leitura\n${"─".repeat(40)}`);

  secao("A reunião e a sala");

  await checar(
    "toda reunião futura tem link de convite",
    "sem `guestToken` o vendedor não tem o que mandar — a reunião existe na agenda e para o lead não existe.",
    `select id, title, "startsAt" from {s}."Meeting"
      where "startsAt" > now() and "guestToken" is null and status <> 'CANCELED'
      order by "startsAt"`,
    (l) => `${l.id} · ${l.title} · ${quando(l.startsAt)}`,
  );

  await checar(
    "ninguém ficou na sala além da janela + 30 min",
    "`Presence.seconds` alimenta `attended`, a taxa de presença e o `Deal.attendance`. Passar do teto é sala que não fechou.",
    `select p.id, p.identity, p.seconds,
            extract(epoch from (m."endsAt" - m."startsAt"))::int as janela
       from {s}."Presence" p join {s}."Meeting" m on m.id = p."meetingId"
      where p.seconds > extract(epoch from (m."endsAt" - m."startsAt")) + 1800
      order by p.seconds desc`,
    (l) => `${l.identity}: ${Math.round(Number(l.seconds) / 60)} min numa janela de ${Math.round(Number(l.janela) / 60)} min`,
  );

  await checar(
    "nenhuma sala reabriu em laço",
    "`room_started` repetido é cliente reconectando sem parar — foi o que inflou a presença da All Hands.",
    `select room, count(*)::int as vezes from {s}."RoomEvent"
      where type = 'room_started' group by room having count(*) > 3
      order by count(*) desc`,
    (l) => `${l.room}: ${l.vezes} aberturas`,
  );

  await checar(
    "nenhuma reunião termina antes de começar",
    "uma janela negativa envenena toda contagem de duração e de presença que passe por ela.",
    `select id, title from {s}."Meeting" where "endsAt" <= "startsAt"`,
    (l) => `${l.id} · ${l.title}`,
  );

  await checar(
    "nenhuma presença com tempo negativo",
    "`seconds` negativo subtrai de um total que devia só crescer.",
    `select id, identity, seconds from {s}."Presence" where seconds < 0`,
    (l) => `${l.identity}: ${l.seconds}s`,
  );

  secao("O negócio");

  await checar(
    "ganho e perdido têm data",
    "o dashboard soma por `wonAt`/`lostAt`. Sem a data, o negócio conta no total e some do mês.",
    `select id, code, status from {s}."Deal"
      where (status = 'WON' and "wonAt" is null) or (status = 'LOST' and "lostAt" is null)`,
    (l) => `${l.code} · ${l.status} sem data`,
  );

  await checar(
    "negócio aberto não tem data de fechamento",
    "o contrário do anterior: data de ganho num negócio OPEN faz o mesmo valor aparecer duas vezes.",
    `select id, code from {s}."Deal"
      where status = 'OPEN' and ("wonAt" is not null or "lostAt" is not null)`,
    (l) => `${l.code}`,
  );

  await checar(
    "todo negócio perdido tem motivo",
    "\"Por que perdemos\" é a tela que existe para isso; sem motivo o negócio some dela.",
    `select id, code from {s}."Deal" where status = 'LOST' and "lossReasonId" is null`,
    (l) => `${l.code}`,
  );

  await checar(
    "probabilidade entre 0 e 100",
    "o previsto do mês é valor × probabilidade. Fora da faixa, ele mente para cima.",
    `select id, code, probability from {s}."Deal" where probability < 0 or probability > 100`,
    (l) => `${l.code}: ${l.probability}%`,
  );

  secao("O funil");

  await checar(
    "todo lead do funil tem os dois ids",
    "o sync procura por `typeLeadId`; sem ele, o lead é recriado e bate no único de `typeSessionId` — e a marca d'água congela para todo mundo.",
    `select id, name from {s}."Lead" where "typeSessionId" is not null and "typeLeadId" is null`,
    (l) => `${l.id} · ${l.name}`,
  );

  await checar(
    "a marca d'água do funil andou nas últimas 12 h",
    "parada = nenhum lead novo está sendo espelhado, e o único sintoma é um 500 num cron que ninguém abre. 12 h e não 2 h de propósito: a marca só avança quando há linha para ler, então uma madrugada sem lead a deixa parada sem nada de errado — este é um sinal de vida, não uma prova.",
    `select "funilSincronizadoAte" from {s}."Config"
      where "funilSincronizadoAte" is not null and "funilSincronizadoAte" < now() - interval '12 hours'`,
    (l) => `parada em ${quando(l.funilSincronizadoAte)}`,
  );

  await checar(
    "nenhum e-mail de lead repetido",
    "dois cadastros do mesmo e-mail são dois donos, duas ligações e o lead atendido duas vezes.",
    `select lower(email) as email, count(*)::int as vezes from {s}."Lead"
      where email is not null and email <> '' group by lower(email) having count(*) > 1
      order by count(*) desc`,
    (l) => `${l.email}: ${l.vezes} cadastros`,
  );

  secao("Tarefa, trabalho e gravação");

  await checar(
    "tarefa concluída tem data de conclusão",
    "e vice-versa. \"Progresso do dia\" conta por status; o histórico, por data.",
    `select id, subject, status from {s}."Task"
      where (status = 'DONE' and "completedAt" is null) or (status <> 'DONE' and "completedAt" is not null)`,
    (l) => `${l.subject} · ${l.status}`,
  );

  await checar(
    "nenhum trabalho de IA preso",
    "PENDENTE há horas com tentativas no teto é job que não vai andar sozinho — e não faz barulho nenhum.",
    `select chave, etapa, tentativas, erro from {s}."AiJob"
      where estado = 'PENDENTE' and "createdAt" < now() - interval '6 hours'
      order by "createdAt"`,
    (l) => `${l.etapa} · ${l.tentativas} tentativas · ${l.erro ?? "sem erro registrado"}`,
  );

  await checar(
    "gravação completa tem caminho",
    "COMPLETA sem `caminho` é um arquivo que ninguém acha — e o webhook fora de transação já desfez essa régua uma vez.",
    `select id, "egressId" from {s}."Recording" where status = 'COMPLETA' and caminho is null`,
    (l) => `${l.egressId}`,
  );

  secao("O time");

  await checar(
    "sessão de grupo não estourou a lotação",
    "vaga vendida além da lotação é gente que entra e não cabe.",
    `select m.id, m.title, m.capacity, count(a.id)::int as inscritos
       from {s}."Meeting" m join {s}."MeetingAttendee" a on a."meetingId" = m.id
      where m.capacity is not null and a.status <> 'CANCELADO'
      group by m.id, m.title, m.capacity having count(a.id) > m.capacity`,
    (l) => `${l.title}: ${l.inscritos} para ${l.capacity} vagas`,
  );

  await checar(
    "etapa do funil sem ordem repetida",
    "duas etapas na mesma posição fazem o pipeline mudar de ordem entre um F5 e outro.",
    `select "order", count(*)::int as vezes from {s}."Stage"
      group by "order" having count(*) > 1`,
    (l) => `posição ${l.order}: ${l.vezes} etapas`,
  );
}

main()
  .catch((erro) => {
    comAchado++;
    console.error("\n✗ a varredura parou:", erro instanceof Error ? erro.message : erro);
  })
  .finally(async () => {
    await db.end().catch(() => {});
    console.log(
      `\n${"─".repeat(40)}\n` +
        (comAchado === 0
          ? `✓ ${checadas} checagens, nada fora do lugar.`
          : `✗ ${comAchado} de ${checadas} checagens acharam algo.`),
    );
    process.exit(comAchado === 0 ? 0 : 1);
  });
