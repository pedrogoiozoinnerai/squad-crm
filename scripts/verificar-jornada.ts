import { config } from "dotenv";

import { randomBytes } from "node:crypto";
import { Client } from "pg";

config({ path: ".env", quiet: true });
config({ path: ".env.local", override: true, quiet: true });

/**
 * A jornada inteira do lead, pela mesma porta que ele usa.
 *
 * Do primeiro campo do funil até o vendedor ver a presença no negócio. Cada
 * passo é HTTP de verdade contra os dois servidores — nada de chamar função
 * interna, porque o que quebra na vida real é a costura entre os dois apps, e
 * costura não aparece em teste unitário.
 *
 * Recusa rodar fora de `_dev`. Limpa o que criou.
 *
 *   npm run verificar:jornada
 */

const FUNIL = process.env.JORNADA_FUNIL ?? "http://localhost:3001";
const CRM = process.env.JORNADA_CRM ?? "http://localhost:3000";
const SCHEMA = process.env.DB_SCHEMA ?? "";
const SCHEMA_FUNIL = process.env.TYPE_DB_SCHEMA ?? "";

if (!SCHEMA.endsWith("_dev") || !SCHEMA_FUNIL.endsWith("_dev")) {
  console.error(`✗ schemas "${SCHEMA}" / "${SCHEMA_FUNIL}" — este script só roda em _dev.`);
  process.exit(1);
}

let falhas = 0;
const ok = (t: string, d = "") => console.log(`  ✓ ${t}${d ? ` — ${d}` : ""}`);
const falha = (t: string, d = "") => {
  falhas++;
  console.log(`  ✗ ${t}${d ? ` — ${d}` : ""}`);
};
const confere = (c: boolean, t: string, d = "") => (c ? ok(t, d) : falha(t, d), c);
const etapa = (t: string) => console.log(`\n── ${t}`);

const db = new Client({ connectionString: process.env.DIRECT_URL });

async function json(r: Response) {
  try {
    return await r.json();
  } catch {
    return null;
  }
}

async function main() {
  console.log(`Jornada do lead\n  funil: ${FUNIL}\n  crm:   ${CRM}`);
  await db.connect();

  const sessionId = `jornada-${randomBytes(6).toString("hex")}`;
  const email = `jornada-${randomBytes(3).toString("hex")}@exemplo.test`;
  let leadCrmId = "";
  let meetingId = "";
  let convite = "";

  // ── 1. O lead abre o funil ────────────────────────────────────────────────
  etapa("1. O lead abre o funil");
  const home = await fetch(`${FUNIL}/`);
  confere(home.ok, "a página carrega", `HTTP ${home.status}`);

  const criar = await fetch(`${FUNIL}/api/leads`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      sessionId,
      utmSource: "meta",
      utmMedium: "cpc",
      utmCampaign: "jornada",
      fbclid: `fb.${randomBytes(4).toString("hex")}`,
      landingUrl: `${FUNIL}/?utm_source=meta`,
    }),
  });
  if (!confere(criar.ok, "o lead nasce no funil", `HTTP ${criar.status}`)) {
    console.log("   ", JSON.stringify(await json(criar)));
    return;
  }

  // ── 2. Responde o questionário ────────────────────────────────────────────
  etapa("2. Responde os sete passos");
  const passos: [string, Record<string, unknown>][] = [
    ["NAME", { fullName: "Lead da Jornada" }],
    ["PHONE", { phoneCountryCode: "+55", phoneNumber: "11999990000", ddd: "11" }],
    ["EMAIL", { email }],
    ["COMPANY", { company: "Empresa da Jornada" }],
    ["SEGMENT", { segment: "Tecnologia (SaaS/Software)" }],
    ["ROLE", { role: "Diretor" }],
    ["REVENUE", { revenueRange: "R$1 a R$5 milhões/ano" }],
  ];

  let respondidos = 0;
  for (const [step, value] of passos) {
    // PATCH, não POST: a rota de passo atualiza o lead que já existe.
    const r = await fetch(`${FUNIL}/api/leads/${sessionId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ step, value }),
    });
    if (r.ok) respondidos++;
    else console.log(`     ✗ ${step}: HTTP ${r.status} ${JSON.stringify(await json(r))}`);
  }
  confere(respondidos === passos.length, "os sete passos gravaram", `${respondidos}/${passos.length}`);

  const noFunil = await db.query(
    `select "currentStep"::text passo, "fullName", email, company, "fbclid"
       from "${SCHEMA_FUNIL}"."Lead" where "sessionId"=$1`,
    [sessionId],
  );
  confere(noFunil.rowCount === 1, "o lead está no banco do funil");
  confere(noFunil.rows[0]?.passo === "SCHEDULE", "chegou ao passo de agendar", noFunil.rows[0]?.passo);
  confere(Boolean(noFunil.rows[0]?.fbclid), "o fbclid foi guardado — é o que a conversão precisa");

  // ── 3. Vê os horários ─────────────────────────────────────────────────────
  etapa("3. Vê os horários disponíveis");
  const agenda = await fetch(`${FUNIL}/api/agenda`).then(json);
  const sessoes: { id: string; inicioEm: string; vagas: number; duracaoMin: number }[] =
    agenda?.sessoes ?? [];
  if (!confere(sessoes.length > 0, "o funil recebe horários", `${sessoes.length} sessões`)) {
    console.log("     → sem série ativa no CRM, o lead vê 'sem horários abertos'");
    return;
  }
  confere(
    Boolean(agenda?.horizonteAte),
    "o proxy repassa até quando a agenda vai",
    agenda?.horizonteAte ?? "AUSENTE — o funil não consegue dizer 'aberta até X'",
  );

  const escolhida = sessoes[0];
  const emMin = Math.round((new Date(escolhida.inicioEm).getTime() - Date.now()) / 60000);
  confere(emMin >= 60, "a primeira respeita a antecedência de 1h", `${emMin} min`);

  // ── 4. Reserva ────────────────────────────────────────────────────────────
  etapa("4. Reserva a vaga");
  const reserva = await fetch(`${FUNIL}/api/leads/${sessionId}/reservar`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ meetingId: escolhida.id }),
  });
  const corpoReserva = await json(reserva);
  if (!confere(reserva.ok, "a reserva é aceita", `HTTP ${reserva.status}`)) {
    console.log("   ", JSON.stringify(corpoReserva));
    return;
  }
  convite = String(corpoReserva?.convite ?? "");
  meetingId = String(corpoReserva?.reuniao?.id ?? "");
  confere(Boolean(convite), "o lead recebe o link do convite");

  const gravado = await db.query(
    `select "scheduledAt", "crmMeetingId", "crmConviteUrl", status::text st
       from "${SCHEMA_FUNIL}"."Lead" where "sessionId"=$1`,
    [sessionId],
  );
  confere(Boolean(gravado.rows[0]?.scheduledAt), "o funil guardou o horário");
  confere(Boolean(gravado.rows[0]?.crmMeetingId), "o funil guardou o id da reunião no CRM");
  confere(gravado.rows[0]?.st === "COMPLETED", "o funil marcou como concluído", gravado.rows[0]?.st);

  // ── 5. O lead chega ao CRM ────────────────────────────────────────────────
  etapa("5. O lead aparece no CRM");
  const noCrm = await db.query(
    `select l.id, l.name, l.email, l."utmSource", l."ownerId", u.name dono
       from "${SCHEMA}"."Lead" l left join "${SCHEMA}"."User" u on u.id = l."ownerId"
      where l."typeSessionId" = $1`,
    [sessionId],
  );
  confere(noCrm.rowCount === 1, "o lead existe no CRM");
  leadCrmId = noCrm.rows[0]?.id ?? "";
  confere(noCrm.rows[0]?.utmSource === "meta", "a origem veio junto", noCrm.rows[0]?.utmSource);
  confere(Boolean(noCrm.rows[0]?.ownerId), "tem dono", noCrm.rows[0]?.dono ?? "NENHUM");

  const inscricao = await db.query(
    `select a.status::text st, a."inviteToken" from "${SCHEMA}"."MeetingAttendee" a
      where a."meetingId"=$1 and a."leadId"=$2`,
    [meetingId, leadCrmId],
  );
  confere(inscricao.rowCount === 1, "está inscrito na sessão", inscricao.rows[0]?.st);

  // ── 6. A página do convite ────────────────────────────────────────────────
  etapa("6. O lead abre o convite");
  const token = convite.split("/convite/")[1] ?? "";
  const pagina = await fetch(`${CRM}/convite/${token}`);
  const html = await pagina.text();
  confere(pagina.ok, "a página do convite abre", `HTTP ${pagina.status}`);
  confere(html.includes("Lead da Jornada"), "mostra o nome do lead");

  // ── 7. A sala ─────────────────────────────────────────────────────────────
  etapa("7. O lead entra na sala");
  const cedo = await fetch(`${CRM}/api/livekit/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ convite: token }),
  });
  const corpoCedo = await json(cedo);
  if (cedo.status === 409) {
    ok("a sala ainda não abriu (abre 30 min antes)", corpoCedo?.erro);
  } else {
    confere(cedo.ok, "o token sai", `HTTP ${cedo.status}`);
  }

  // Empurra a reunião para agora, para exercitar a entrada de verdade.
  const utc = (d: Date) => d.toISOString().replace("T", " ").replace("Z", "");
  await db.query(
    `update "${SCHEMA}"."Meeting" set "startsAt"=$1, "endsAt"=$2 where id=$3`,
    [utc(new Date(Date.now() - 60_000)), utc(new Date(Date.now() + 44 * 60_000)), meetingId],
  );

  const tok = await fetch(`${CRM}/api/livekit/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ convite: token }),
  });
  const corpoTok = await json(tok);
  if (confere(tok.ok, "com a sala aberta, o token sai", `HTTP ${tok.status}`)) {
    const c = JSON.parse(Buffer.from(String(corpoTok.token).split(".")[1], "base64url").toString());
    confere(c.video?.roomJoin === true, "pode entrar");
    confere(c.video?.canPublish === true, "pode LIGAR CÂMERA E MICROFONE");
    confere(c.video?.canPublishData === true, "pode usar o chat");
    confere(c.video?.canSubscribe === true, "pode ver e ouvir os outros");
    confere(c.video?.roomAdmin !== true, "não é host");
  } else {
    console.log("   ", JSON.stringify(corpoTok));
  }

  // ── 8. A permissão de mídia do navegador ──────────────────────────────────
  etapa("8. O navegador libera câmera e microfone nessa página?");
  for (const caminho of [`/convite/${token}`, `/sala/${meetingId}`, `/entrar/x`]) {
    const r = await fetch(`${CRM}${caminho}`);
    const pp = r.headers.get("permissions-policy") ?? "";
    const liberado = pp.includes("camera=(self)") && pp.includes("microphone=(self)");
    confere(liberado, `Permissions-Policy em ${caminho}`, liberado ? "camera e microfone liberados" : pp || "ausente");
  }

  // ── 9. O vendedor, no CRM ─────────────────────────────────────────────────
  etapa("9. O vendedor vê tudo no CRM");
  const reuniao = await db.query(
    `select m.id, m.title, m."guestToken" is not null tem_link, m."ownerId",
            (select count(*)::int from "${SCHEMA}"."MeetingAttendee" a where a."meetingId"=m.id) inscritos
       from "${SCHEMA}"."Meeting" m where m.id=$1`,
    [meetingId],
  );
  confere(reuniao.rowCount === 1, "a reunião está na agenda do vendedor");
  confere(reuniao.rows[0]?.tem_link === true, "a reunião tem link para compartilhar");
  confere((reuniao.rows[0]?.inscritos ?? 0) >= 1, "o inscrito aparece no roster", `${reuniao.rows[0]?.inscritos}`);

  const atividade = await db.query(
    `select count(*)::int n from "${SCHEMA}"."Activity" where "leadId"=$1`,
    [leadCrmId],
  );
  confere(atividade.rows[0].n > 0, "a linha do tempo do lead tem registro", `${atividade.rows[0].n}`);

  console.log("\n— limpando —");
  await db.query(`delete from "${SCHEMA}"."MeetingAttendee" where "leadId"=$1`, [leadCrmId]);
  await db.query(`delete from "${SCHEMA}"."Activity" where "leadId"=$1`, [leadCrmId]);
  await db.query(`delete from "${SCHEMA}"."Deal" where "leadId"=$1`, [leadCrmId]);
  await db.query(`delete from "${SCHEMA}"."Lead" where id=$1`, [leadCrmId]);
  await db.query(`delete from "${SCHEMA_FUNIL}"."LeadEvent" where "leadId" in (select id from "${SCHEMA_FUNIL}"."Lead" where "sessionId"=$1)`, [sessionId]);
  await db.query(`delete from "${SCHEMA_FUNIL}"."Lead" where "sessionId"=$1`, [sessionId]);
  ok("banco limpo");
}

main()
  .catch((e) => {
    falhas++;
    console.error("\n✗ o script parou:", e instanceof Error ? e.message : e);
  })
  .finally(async () => {
    await db.end().catch(() => {});
    console.log(
      falhas === 0
        ? "\n✓ a jornada do lead está inteira."
        : `\n✗ ${falhas} ${falhas === 1 ? "ponto quebrado" : "pontos quebrados"}.`,
    );
    process.exit(falhas === 0 ? 0 : 1);
  });
