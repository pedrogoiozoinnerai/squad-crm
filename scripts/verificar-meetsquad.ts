import { config } from "dotenv";

import { createHash, createHmac, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { Client } from "pg";

// A MESMA precedência do Next: `.env.local` vence `.env`. Sem isto o script
// assinaria os webhooks com a chave do LiveKit Cloud enquanto o servidor
// confere com a do servidor local — e os quatro eventos voltariam 401.
config({ path: ".env", quiet: true });
config({ path: ".env.local", override: true, quiet: true });

/**
 * O fluxo inteiro do MeetSquad, de ponta a ponta, contra o servidor rodando.
 *
 * Não é teste unitário: é a pergunta "se um lead terminar o funil agora, ele
 * consegue entrar numa sala daqui a uma hora e a presença dele chega ao
 * negócio?". Cada elo é exercitado pela mesma porta que a operação usa —
 * HTTP de verdade, webhook assinado de verdade, cron de verdade.
 *
 * Recusa rodar fora de um schema `_dev`. Limpa o que criou no fim.
 *
 *   npm run verificar:meetsquad
 */

const BASE = process.env.VERIFICAR_URL ?? "http://localhost:3000";
const SCHEMA = process.env.DB_SCHEMA ?? "";

/**
 * A antecedência, lida da fonte.
 *
 * Por texto e não por `import`: este script é Node puro, e importar de
 * `src/lib` traria `server-only` e o alias `@/` junto. O ponto é o mesmo de
 * `testes/presenca.test.ts` com a régua de presença — uma cópia do número aqui
 * envelhece calada e passa a acusar o código de um erro que ele não tem.
 */
const ANTECEDENCIA_MIN = Number(
  readFileSync(new URL("../src/lib/sessoes.ts", import.meta.url), "utf8").match(
    /export const ANTECEDENCIA_MIN = (\d+)/,
  )?.[1] ?? 5,
);

if (!SCHEMA.endsWith("_dev")) {
  console.error(`✗ DB_SCHEMA é "${SCHEMA}". Este script só roda em _dev.`);
  process.exit(1);
}

let falhas = 0;
const criados = { meetingId: "", leadId: "", dealId: "", attendeeId: "" };

function ok(rotulo: string, detalhe = "") {
  console.log(`  ✓ ${rotulo}${detalhe ? ` — ${detalhe}` : ""}`);
}
function falha(rotulo: string, detalhe = "") {
  falhas++;
  console.log(`  ✗ ${rotulo}${detalhe ? ` — ${detalhe}` : ""}`);
}
function confere(condicao: boolean, rotulo: string, detalhe = "") {
  (condicao ? ok : falha)(rotulo, detalhe);
  return condicao;
}
function etapa(n: number, titulo: string) {
  console.log(`\n${n}. ${titulo}`);
}

const db = new Client({ connectionString: process.env.DIRECT_URL });

/**
 * O texto que o Prisma grava numa coluna `timestamp without time zone`.
 *
 * O `pg` serializa um `Date` usando o fuso do PROCESSO: numa máquina em São
 * Paulo, `12:27Z` vira `09:27` na coluna. O Prisma lê a mesma coluna como UTC,
 * e a reunião nasce três horas no passado — a rota do token responde "esta
 * reunião já terminou" para uma que está acontecendo.
 *
 * É o mesmo defeito que este projeto acabou de consertar na aplicação, e não
 * podia sobreviver no script que serve para provar que ele sumiu.
 */
function comoOPrismaGrava(d: Date) {
  return d.toISOString().replace("T", " ").replace("Z", "");
}

/** Assina um webhook do jeito que o LiveKit assina: JWT com o sha256 do corpo. */
function webhookAssinado(corpo: unknown, apiKey: string, apiSecret: string) {
  const cru = JSON.stringify(corpo);
  const b64 = (v: string | Buffer) =>
    Buffer.from(v).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  const agora = Math.floor(Date.now() / 1000);
  const cabecalho = b64(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const reivindicacoes = b64(
    JSON.stringify({
      iss: apiKey,
      nbf: agora - 10,
      exp: agora + 300,
      sha256: createHash("sha256").update(cru).digest("base64"),
    }),
  );
  const assinatura = b64(
    createHmac("sha256", apiSecret).update(`${cabecalho}.${reivindicacoes}`).digest(),
  );
  return { cru, autorizacao: `${cabecalho}.${reivindicacoes}.${assinatura}` };
}

async function entregarEvento(evento: Record<string, unknown>) {
  const chaves = {
    apiKey: process.env.LIVEKIT_API_KEY ?? "",
    apiSecret: process.env.LIVEKIT_API_SECRET ?? "",
  };
  const { cru, autorizacao } = webhookAssinado(evento, chaves.apiKey, chaves.apiSecret);
  const r = await fetch(`${BASE}/api/livekit/webhook`, {
    method: "POST",
    headers: { "content-type": "application/webhook+json", authorization: autorizacao },
    body: cru,
  });
  return r.status;
}

async function main() {
  console.log(`MeetSquad · fluxo completo\n  servidor: ${BASE}\n  schema:   ${SCHEMA}`);

  await db.connect();

  // ── 1. O servidor está de pé ──────────────────────────────────────────────
  etapa(1, "O servidor responde");
  const saude = await fetch(`${BASE}/api/saude`).then((r) => r.json());
  confere(saude.banco === "ok", "banco alcançável", saude.schema);
  confere(saude.schema === SCHEMA, "no schema certo");

  // ── 2. A agenda oferece horário para HOJE ─────────────────────────────────
  etapa(2, "A agenda do funil oferece horário para hoje");
  const disp = await fetch(`${BASE}/api/agenda/disponibilidade`).then((r) => r.json());
  const agora = new Date();
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora);
  const doDia = disp.sessoes.filter(
    (s: { inicioEm: string }) =>
      new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(
        new Date(s.inicioEm),
      ) === hoje,
  );
  confere(disp.sessoes.length > 0, "há sessões abertas", `${disp.sessoes.length} no total`);

  // "Ainda hoje" só é pergunta enquanto o dia dá para agendar. Rodando às 23h,
  // zero sessão restante é o dia ter acabado, não a agenda estar vazia — e uma
  // verificação que falha por causa da hora é uma que o time aprende a ignorar.
  const horaLocal = Number(
    new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      hour12: false,
    }).format(agora),
  );
  if (horaLocal < 20) {
    confere(doDia.length > 0, "há sessão AINDA HOJE", `${doDia.length} hoje`);
  } else {
    ok("há sessão ainda hoje", `não perguntado — ${horaLocal}h, o dia acabou`);
  }

  const primeira = doDia[0] ?? disp.sessoes[0];
  if (!primeira) {
    falha("nenhuma sessão para testar — rode /api/cron/sessoes antes");
    return;
  }
  const emMinutos = Math.round((new Date(primeira.inicioEm).getTime() - agora.getTime()) / 60_000);
  // A régua sai do código, não de um número escrito aqui. Estava fixa em 60 e
  // passou a acusar erro quando a antecedência virou 5 — e o número 5 é a
  // correção, não o defeito: às 09:53 o funil escondia a sessão das 10:00 cuja
  // sala já estava aberta desde 09:30, com vinte vagas livres.
  confere(
    emMinutos >= ANTECEDENCIA_MIN,
    `a primeira respeita a antecedência de ${ANTECEDENCIA_MIN} min`,
    `${emMinutos} min`,
  );
  ok("sessão escolhida", `${new Date(primeira.inicioEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} · ${primeira.vagas} vagas`);

  // ── 3. O funil reserva a vaga ─────────────────────────────────────────────
  etapa(3, "O funil do Type reserva a vaga");
  const typeSessionId = `verificacao-${randomBytes(6).toString("hex")}`;
  const reserva = await fetch(`${BASE}/api/agenda/reservar`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.FUNIL_API_KEY}`,
    },
    body: JSON.stringify({
      meetingId: primeira.id,
      typeSessionId,
      typeLeadId: `lead-${typeSessionId}`,
      nome: "Verificação MeetSquad",
      email: "verificacao@exemplo.test",
      telefone: "+5511999990000",
      empresa: "Empresa de Verificação",
      segmento: "Tecnologia",
    }),
  });
  const corpoReserva = await reserva.json();
  if (!confere(reserva.ok, "reserva aceita", `HTTP ${reserva.status}`)) {
    console.log("   ", JSON.stringify(corpoReserva));
    return;
  }
  criados.meetingId = corpoReserva.reuniao.id;
  confere(Boolean(corpoReserva.convite), "devolveu o link do convite");

  const token = corpoReserva.convite.split("/convite/")[1];
  confere(Boolean(token) && token.length >= 32, "o token do convite é longo", `${token?.length} chars`);

  const lead = await db.query(
    `select id, "typeLeadId", name from "${SCHEMA}"."Lead" where "typeSessionId" = $1`,
    [typeSessionId],
  );
  criados.leadId = lead.rows[0]?.id ?? "";
  confere(lead.rowCount === 1, "o lead nasceu no CRM");
  confere(
    lead.rows[0]?.typeLeadId === `lead-${typeSessionId}`,
    "typeLeadId gravado (é a ponte que evita lead duplicado pelo cron)",
  );

  // ── 4. Idempotência: reservar de novo não duplica ─────────────────────────
  etapa(4, "Reservar de novo devolve a MESMA inscrição");
  const denovo = await fetch(`${BASE}/api/agenda/reservar`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.FUNIL_API_KEY}`,
    },
    body: JSON.stringify({ meetingId: primeira.id, typeSessionId, nome: "Verificação MeetSquad" }),
  }).then((r) => r.json());
  confere(denovo.jaEstava === true, "respondeu jaEstava");
  confere(denovo.convite === corpoReserva.convite, "o mesmo link — não trocou o que já foi ao WhatsApp");

  const assentos = await db.query(
    `select count(*)::int as n from "${SCHEMA}"."MeetingAttendee" where "meetingId"=$1 and "leadId"=$2`,
    [criados.meetingId, criados.leadId],
  );
  confere(assentos.rows[0].n === 1, "uma inscrição só no banco");

  // ── 5. Sem chave, a reserva é recusada ────────────────────────────────────
  etapa(5, "A reserva exige a chave do funil");
  const semChave = await fetch(`${BASE}/api/agenda/reservar`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ meetingId: primeira.id, typeSessionId: "x", nome: "x" }),
  });
  confere(semChave.status === 401, "401 sem chave", `HTTP ${semChave.status}`);

  // ── 6. A página do convite existe e conta o tempo ─────────────────────────
  etapa(6, "A página do convite abre para o lead");
  const pagina = await fetch(`${BASE}/convite/${token}`);
  const html = await pagina.text();
  confere(pagina.status === 200, "a página responde", `HTTP ${pagina.status}`);
  confere(html.includes("Verificação MeetSquad"), "mostra o nome do lead");

  const conviteErrado = await fetch(`${BASE}/convite/${"0".repeat(64)}`);
  confere(conviteErrado.status === 404, "token inventado dá 404", `HTTP ${conviteErrado.status}`);

  // ── 7. O token da sala: duas portas, e nenhuma terceira ───────────────────
  etapa(7, "O token da sala");
  const semNada = await fetch(`${BASE}/api/livekit/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ meetingId: criados.meetingId }),
  });
  confere(
    semNada.status === 401 || semNada.status === 403,
    "só o id da reunião NÃO abre a sala",
    `HTTP ${semNada.status}`,
  );

  const cedo = await fetch(`${BASE}/api/livekit/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ convite: token }),
  });
  const corpoCedo = await cedo.json();
  if (cedo.status === 409) {
    ok("a sala ainda não abriu (abre 30 min antes)", corpoCedo.erro);
  } else if (cedo.ok) {
    ok("a sala está aberta e o token saiu", `sala ${corpoCedo.sala ?? ""}`);
  } else {
    falha("resposta inesperada do token", `HTTP ${cedo.status} ${JSON.stringify(corpoCedo)}`);
  }

  // ── 8. A sala de uma reunião que começa AGORA ─────────────────────────────
  etapa(8, "Uma reunião que acabou de terminar: token, sala no LiveKit e presença");
  // Começou há 50 minutos e terminou há 5. Os dois elos cabem nesta janela: a
  // sala continua aberta (fecha 120 min depois do fim, para call que emenda),
  // e a reconciliação já a enxerga, porque ela só olha reunião ENCERRADA —
  // presença de call em andamento ainda está correndo.
  const inicio = new Date(Date.now() - 50 * 60_000);
  const fim = new Date(Date.now() - 5 * 60_000);
  const dono = (await db.query(`select id from "${SCHEMA}"."User" where active limit 1`)).rows[0].id;
  const etapaId = (await db.query(`select id from "${SCHEMA}"."Stage" order by "order" limit 1`))
    .rows[0].id;

  const agoraId = randomBytes(12).toString("hex");
  criados.dealId = randomBytes(12).toString("hex");
  await db.query(
    `insert into "${SCHEMA}"."Deal" (id,"createdAt","updatedAt",code,"leadId","stageId",status,"valueCents","ownerId")
     values ($1,now(),now(),$2,$3,$4,'OPEN',0,$5)`,
    [criados.dealId, `#v${randomBytes(3).toString("hex")}`, criados.leadId, etapaId, dono],
  );
  await db.query(
    `insert into "${SCHEMA}"."Meeting" (id,"createdAt","updatedAt",title,"startsAt","endsAt",type,status,"ownerId","leadId","dealId")
     values ($1,now(),now(),'VERIFICAÇÃO · reunião encerrada',$2,$3,'ONE_ON_ONE','SCHEDULED',$4,$5,$6)`,
    [agoraId, comoOPrismaGrava(inicio), comoOPrismaGrava(fim), dono, criados.leadId, criados.dealId],
  );
  const conviteAgora = randomBytes(32).toString("hex");
  criados.attendeeId = randomBytes(12).toString("hex");
  await db.query(
    `insert into "${SCHEMA}"."MeetingAttendee" (id,"createdAt","meetingId","leadId",status,source,"inviteToken","invitedAt")
     values ($1,now(),$2,$3,'INSCRITO','CONVITE',$4,now())`,
    [criados.attendeeId, agoraId, criados.leadId, conviteAgora],
  );
  ok("reunião criada: começou há 50 min, terminou há 5");

  const tok = await fetch(`${BASE}/api/livekit/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ convite: conviteAgora }),
  });
  const corpoTok = await tok.json();
  const temToken = confere(tok.ok, "token emitido pelo convite", `HTTP ${tok.status}`);
  if (!temToken) console.log("   ", JSON.stringify(corpoTok));
  if (temToken) {
    confere(typeof corpoTok.token === "string", "veio um JWT");
    confere(corpoTok.url?.startsWith("ws"), "veio a URL do LiveKit", corpoTok.url);
    const partes = String(corpoTok.token).split(".");
    const claims = JSON.parse(Buffer.from(partes[1], "base64url").toString());
    confere(claims.video?.roomJoin === true, "o token permite entrar");
    confere(claims.video?.roomAdmin !== true, "o LEAD não é host");
    confere(claims.sub === `l_${criados.leadId}`, "a identidade é a do lead", claims.sub);
  }

  const aberturas = await db.query(
    `select "openCount" from "${SCHEMA}"."MeetingAttendee" where id=$1`,
    [criados.attendeeId],
  );
  confere(aberturas.rows[0]?.openCount >= 1, "o acesso do convite foi contado");

  // ── 8b. O LINK da reunião: a terceira porta ───────────────────────────────
  etapa(8.5 as unknown as number, "O link da reunião — quem não tem conta nem convite");
  const guest = randomBytes(32).toString("hex");
  await db.query(`update "${SCHEMA}"."Meeting" set "guestToken"=$1 where id=$2`, [guest, agoraId]);

  const paginaLink = await fetch(`${BASE}/entrar/${guest}`);
  confere(paginaLink.status === 200, "a página do link abre", `HTTP ${paginaLink.status}`);

  const linkInventado = await fetch(`${BASE}/entrar/${"0".repeat(64)}`);
  confere(linkInventado.status === 404, "link inventado dá 404", `HTTP ${linkInventado.status}`);

  const tokConvidado = await fetch(`${BASE}/api/livekit/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ convidado: guest, nome: "Pessoa Convidada" }),
  });
  const corpoConv = await tokConvidado.json();
  if (confere(tokConvidado.ok, "token emitido pelo link", `HTTP ${tokConvidado.status}`)) {
    const c = JSON.parse(Buffer.from(String(corpoConv.token).split(".")[1], "base64url").toString());
    confere(c.video?.roomJoin === true, "o convidado entra");
    confere(c.video?.roomAdmin !== true, "o convidado NÃO é host");
    confere(String(c.sub).startsWith("c_"), "identidade de convidado", c.sub);
    confere(c.name === "Pessoa Convidada", "usa o nome que a pessoa digitou", c.name);
  }

  // Duas pessoas pelo mesmo link têm de virar dois participantes: identidade
  // repetida faz o LiveKit derrubar quem entrou antes.
  const segundo = await fetch(`${BASE}/api/livekit/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ convidado: guest, nome: "Outra Pessoa" }),
  }).then((r) => r.json());
  const id1 = JSON.parse(Buffer.from(String(corpoConv.token).split(".")[1], "base64url").toString()).sub;
  const id2 = JSON.parse(Buffer.from(String(segundo.token).split(".")[1], "base64url").toString()).sub;
  confere(id1 !== id2, "duas pessoas pelo mesmo link viram dois participantes");

  // ── 8.6. O chat guarda a conversa ─────────────────────────────────────────
  //
  // O defeito era este: a conversa vivia só no canal de dados do LiveKit, que
  // não tem memória. Fechar o painel apagava tudo, recarregar apagava tudo, e
  // quem entrava no meio da sessão via um chat vazio. Estas verificações batem
  // na rota pela mesma porta que o convidado usa.
  etapa(8.6 as unknown as number, "O chat guarda a conversa");

  const comoConvidado = { convidado: guest, identidade: id1, nome: "Pessoa Convidada" };

  const mandou = await fetch(`${BASE}/api/sala/mensagens`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...comoConvidado, texto: "  mensagem do teste  " }),
  });
  const gravada = await mandou.json().catch(() => null);
  confere(mandou.ok, "a mensagem é aceita", `HTTP ${mandou.status}`);
  confere(
    gravada?.autor === "Pessoa Convidada",
    "assinada com o nome que a pessoa digitou",
    gravada?.autor,
  );

  const historico = await fetch(
    `${BASE}/api/sala/mensagens?${new URLSearchParams(comoConvidado)}`,
  ).then((r) => r.json());
  const minhas = (historico?.mensagens ?? []) as { texto: string; identidade: string }[];
  confere(minhas.length === 1, "o histórico devolve a mensagem", `${minhas.length}`);
  confere(minhas[0]?.texto === "mensagem do teste", "o texto vem aparado", minhas[0]?.texto);
  confere(
    historico?.identidade === id1,
    "a identidade dita é respeitada — senão a própria mensagem volta como de outro",
    historico?.identidade,
  );

  // Mensagem vazia não existe: sem isto, apertar enviar sem digitar nada
  // guardaria uma linha em branco na conversa de todo mundo.
  const vazia = await fetch(`${BASE}/api/sala/mensagens`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...comoConvidado, texto: "   \n  " }),
  });
  confere(vazia.status === 400, "mensagem em branco é recusada", `HTTP ${vazia.status}`);

  // A porta do chat é a MESMA da sala: quem não entra não escreve.
  const semPorta = await fetch(`${BASE}/api/sala/mensagens`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ meetingId: agoraId, texto: "não devia passar" }),
  });
  confere(semPorta.status === 401, "sem credencial nenhuma, não escreve", `HTTP ${semPorta.status}`);

  const linkFalso = await fetch(`${BASE}/api/sala/mensagens`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ convidado: "0".repeat(64), texto: "de outra sala" }),
  });
  confere(linkFalso.status === 404, "link inventado não escreve", `HTTP ${linkFalso.status}`);

  // E ninguém assina como o vendedor: o autor sai de quem autorizou, não do
  // corpo da requisição.
  const forjada = await fetch(`${BASE}/api/sala/mensagens`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ...comoConvidado,
      identidade: `u_${criados.meetingId}`,
      texto: "sou o vendedor",
    }),
  });
  const forjadaCorpo = await forjada.json().catch(() => null);
  confere(
    forjada.ok && String(forjadaCorpo?.identidade).startsWith("c_"),
    "identidade forjada de usuário é descartada",
    forjadaCorpo?.identidade,
  );

  // ── 9. O webhook do LiveKit vira evento cru ───────────────────────────────
  etapa(9, "O webhook do LiveKit");
  const sala = `reuniao-${agoraId}`;
  const entrou = new Date(Date.now() - 45 * 60_000);
  const saiu = new Date(Date.now() - 30 * 60_000);
  const seg = (d: Date) => Math.floor(d.getTime() / 1000);

  const eventos = [
    { event: "room_started", id: `v-${randomBytes(6).toString("hex")}`, createdAt: seg(entrou), room: { name: sala, sid: "RM_v" } },
    { event: "participant_joined", id: `v-${randomBytes(6).toString("hex")}`, createdAt: seg(entrou), room: { name: sala, sid: "RM_v" }, participant: { identity: `l_${criados.leadId}`, name: "Verificação MeetSquad" } },
    { event: "participant_left", id: `v-${randomBytes(6).toString("hex")}`, createdAt: seg(saiu), room: { name: sala, sid: "RM_v" }, participant: { identity: `l_${criados.leadId}`, name: "Verificação MeetSquad" } },
    // O gravador entra na sala como participante de verdade: o LiveKit sobe um
    // navegador sem tela e ele dá `join` como qualquer um. Está aqui para a
    // reconciliação de (10) ter que excluí-lo.
    { event: "participant_joined", id: `v-${randomBytes(6).toString("hex")}`, createdAt: seg(entrou), room: { name: sala, sid: "RM_v" }, participant: { identity: "EG_verificacao", name: "Egress" } },
    { event: "participant_left", id: `v-${randomBytes(6).toString("hex")}`, createdAt: seg(saiu), room: { name: sala, sid: "RM_v" }, participant: { identity: "EG_verificacao", name: "Egress" } },
    { event: "room_finished", id: `v-${randomBytes(6).toString("hex")}`, createdAt: seg(saiu), room: { name: sala, sid: "RM_v" } },
  ];

  let entregues = 0;
  for (const e of eventos) if ((await entregarEvento(e)) === 200) entregues++;
  confere(entregues === eventos.length, `os ${eventos.length} eventos foram aceitos`, `${entregues}/${eventos.length}`);

  const repetido = await entregarEvento(eventos[1]);
  confere(repetido === 200, "reentrega do mesmo evento responde 200 (o LiveKit reentrega)");

  // Conta só os que ESTE script mandou. O servidor local do LiveKit está
  // configurado para mandar os eventos dele para a mesma rota, então a sala
  // criada de verdade em (8) também gera `room_started` — o que é o sistema
  // funcionando, não duplicata.
  const meus = eventos.map((e) => e.id as string);
  const crus = await db.query(
    `select count(*)::int as n from "${SCHEMA}"."RoomEvent" where "livekitId" = any($1)`,
    [meus],
  );
  confere(
    crus.rows[0].n === eventos.length,
    "cada evento entrou uma vez só, mesmo reentregue",
    `${crus.rows[0].n} de ${eventos.length}`,
  );

  const forjado = await fetch(`${BASE}/api/livekit/webhook`, {
    method: "POST",
    headers: { "content-type": "application/webhook+json", authorization: "Bearer inventado" },
    body: JSON.stringify(eventos[0]),
  });
  confere(forjado.status === 401, "webhook sem assinatura válida é recusado", `HTTP ${forjado.status}`);

  // ── 9.5. O evento de gravação vira `Recording` ────────────────────────────
  //
  // Roda sem bucket, sem conta e sem gravação de verdade: o que se prova aqui é
  // que o corpo assinado que o LiveKit manda deixa de ser achatado num
  // `RoomEvent` e passa a virar uma linha com caminho, tamanho e duração.
  etapa(9.5 as unknown as number, "A gravação: o egress deixa de ser jogado fora");
  const egressId = `EG_${randomBytes(6).toString("hex")}`;
  const nano = (d: Date) => String(d.getTime() * 1_000_000);

  const egressPronto = {
    event: "egress_ended",
    id: `v-${randomBytes(6).toString("hex")}`,
    createdAt: seg(saiu),
    egressInfo: {
      egressId,
      roomName: sala,
      status: "EGRESS_COMPLETE",
      startedAt: nano(entrou),
      endedAt: nano(saiu),
      fileResults: [
        { filename: `reunioes/2026/09/17/${agoraId}.mp4`, size: "26214400", duration: "900000000000" },
      ],
    },
  };
  confere((await entregarEvento(egressPronto)) === 200, "o `egress_ended` é aceito");

  const linhaDaGravacao = await db.query(
    `select status, caminho, bytes, "duracaoSegundos" from "${SCHEMA}"."Recording" where "egressId"=$1`,
    [egressId],
  );
  confere(linhaDaGravacao.rowCount === 1, "uma gravação registrada");
  confere(linhaDaGravacao.rows[0]?.status === "COMPLETA", "com o estado traduzido", linhaDaGravacao.rows[0]?.status);
  confere(
    linhaDaGravacao.rows[0]?.caminho === `reunioes/2026/09/17/${agoraId}.mp4`,
    "com o caminho do arquivo — que antes era descartado",
  );
  confere(Number(linhaDaGravacao.rows[0]?.bytes) === 26_214_400, "com o tamanho em bytes");
  confere(linhaDaGravacao.rows[0]?.duracaoSegundos === 900, "com a duração MEDIDA, em segundos");

  // O caso que só acontece na vida real: o LiveKit reentrega o que não recebeu
  // 200, e não promete ordem. Um `egress_started` chegando agora faria a
  // gravação pronta voltar a dizer "gravando" na tela do closer.
  const egressAtrasado = {
    ...egressPronto,
    event: "egress_started",
    id: `v-${randomBytes(6).toString("hex")}`,
    egressInfo: { ...egressPronto.egressInfo, status: "EGRESS_ACTIVE", endedAt: "0", fileResults: [] },
  };
  confere((await entregarEvento(egressAtrasado)) === 200, "um `egress_started` atrasado é aceito");

  const depois = await db.query(
    `select status, caminho, bytes from "${SCHEMA}"."Recording" where "egressId"=$1`,
    [egressId],
  );
  confere(depois.rows[0]?.status === "COMPLETA", "e NÃO faz a gravação voltar a 'gravando'");
  confere(
    depois.rows[0]?.caminho === `reunioes/2026/09/17/${agoraId}.mp4`,
    "nem apaga o caminho que o evento magro não traz",
  );

  // ── 10. A reconciliação deriva presença e leva ao negócio ─────────────────
  etapa(10, "A reconciliação: evento cru vira presença, e presença vira negócio");
  const cron = await fetch(`${BASE}/api/cron/presenca`, {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
  const relatorio = await cron.json();
  confere(cron.ok, "o cron rodou", JSON.stringify(relatorio).slice(0, 120));

  const presenca = await db.query(
    `select identity, seconds, "leadId" from "${SCHEMA}"."Presence" where "meetingId"=$1`,
    [agoraId],
  );
  confere(presenca.rowCount === 1, "uma presença derivada");
  // O gravador entrou e saiu junto com o lead. Sem o filtro ele seria a
  // segunda linha — e numa sessão de dois inscritos dobraria a taxa sozinho.
  confere(
    !presenca.rows.some((l: { identity: string }) => l.identity.startsWith("EG_")),
    "o gravador NÃO virou presença",
  );
  const segundos = presenca.rows[0]?.seconds ?? 0;
  confere(segundos >= 880 && segundos <= 920, "o tempo bate com os eventos (~15 min)", `${segundos}s`);
  confere(presenca.rows[0]?.leadId === criados.leadId, "amarrada ao lead pelo prefixo da identidade");

  const assento = await db.query(
    `select attended, "totalSeconds", "regraMinutos" from "${SCHEMA}"."MeetingAttendee" where id=$1`,
    [criados.attendeeId],
  );
  confere(assento.rows[0]?.totalSeconds > 0, "o roster recebeu o tempo medido", `${assento.rows[0]?.totalSeconds}s`);
  confere(assento.rows[0]?.attended === true, "15 min passam da régua de 5 — presente");
  confere(
    typeof assento.rows[0]?.regraMinutos === "number",
    "guardou a régua que produziu o veredicto",
    `${assento.rows[0]?.regraMinutos} min`,
  );

  const reuniaoFim = await db.query(
    `select status from "${SCHEMA}"."Meeting" where id=$1`,
    [agoraId],
  );
  confere(reuniaoFim.rows[0]?.status === "DONE", "a reunião virou DONE sozinha", reuniaoFim.rows[0]?.status);

  const negocio = await db.query(
    `select attendance, "attendanceManual" from "${SCHEMA}"."Deal" where id=$1`,
    [criados.dealId],
  );
  confere(
    negocio.rows[0]?.attendance === "PARTICIPOU",
    "o attendance do negócio deixou de ser digitado à mão",
    negocio.rows[0]?.attendance,
  );

  // ── 11. Recalcular do zero dá o mesmo ─────────────────────────────────────
  etapa(11, "Apagar a presença e reconciliar de novo devolve o mesmo número");
  await db.query(`delete from "${SCHEMA}"."Presence" where "meetingId"=$1`, [agoraId]);
  await fetch(`${BASE}/api/cron/presenca`, {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
  const denovoP = await db.query(
    `select seconds from "${SCHEMA}"."Presence" where "meetingId"=$1`,
    [agoraId],
  );
  confere(denovoP.rows[0]?.seconds === segundos, "idempotente", `${denovoP.rows[0]?.seconds}s`);

  // ── 11.5. A sala que ninguém fechou ───────────────────────────────────────
  //
  // O caso que aconteceu, reproduzido: uma reunião de 45 minutos cuja sala só
  // foi encerrada dez horas depois. No banco de produção isso virou 322 e 366
  // minutos de `Presence.seconds` — e `seconds` decide `attended`, que decide a
  // taxa de presença e o `Deal.attendance`.
  //
  // O teto que impediria isso não existia: o `CreateRoom` do LiveKit não tem
  // campo de duração máxima. Aqui a pergunta é a da régua — a permanência
  // aberta é cortada em `endsAt + 30 min` e não no instante em que a sala caiu.
  etapa(11.5 as unknown as number, "Sala esquecida aberta não fabrica presença");

  const inicioLongo = new Date(Date.now() - 11 * 60 * 60_000);
  const fimLongo = new Date(inicioLongo.getTime() + 45 * 60_000);
  const salaCaiu = new Date(Date.now() - 10 * 60_000);
  const longoId = randomBytes(12).toString("hex");

  await db.query(
    `insert into "${SCHEMA}"."Meeting" (id,"createdAt","updatedAt",title,"startsAt","endsAt",type,status,"ownerId","leadId")
     values ($1,now(),now(),'VERIFICAÇÃO · sala esquecida aberta',$2,$3,'GROUP','SCHEDULED',$4,$5)`,
    [longoId, comoOPrismaGrava(inicioLongo), comoOPrismaGrava(fimLongo), dono, criados.leadId],
  );

  const salaLonga = `reuniao-${longoId}`;
  const eventosLongos = [
    { event: "room_started", id: `v-${randomBytes(6).toString("hex")}`, createdAt: seg(inicioLongo), room: { name: salaLonga, sid: "RM_vl" } },
    // Entra no começo e NUNCA sai: é o que o cliente reconectando em laço
    // deixa no banco — entradas sem a saída correspondente.
    { event: "participant_joined", id: `v-${randomBytes(6).toString("hex")}`, createdAt: seg(inicioLongo), room: { name: salaLonga, sid: "RM_vl" }, participant: { identity: `l_${criados.leadId}`, name: "Verificação MeetSquad" } },
    // E a sala só cai dez horas depois do fim marcado.
    { event: "room_finished", id: `v-${randomBytes(6).toString("hex")}`, createdAt: seg(salaCaiu), room: { name: salaLonga, sid: "RM_vl" } },
  ];
  let longosEntregues = 0;
  for (const e of eventosLongos) if ((await entregarEvento(e)) === 200) longosEntregues++;
  confere(longosEntregues === eventosLongos.length, "os eventos da sala longa foram aceitos");

  await fetch(`${BASE}/api/cron/presenca`, {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  });

  const presencaLonga = await db.query(
    `select seconds from "${SCHEMA}"."Presence" where "meetingId"=$1`,
    [longoId],
  );
  const segundosLongos = presencaLonga.rows[0]?.seconds ?? 0;
  // 45 min de janela + 30 min de folga = 4500 s. Sem o teto seriam ~39.000.
  confere(
    segundosLongos >= 4480 && segundosLongos <= 4520,
    "a permanência para em endsAt + 30 min, não quando a sala caiu",
    `${Math.round(segundosLongos / 60)} min numa janela de 45 — a sala ficou ${Math.round((salaCaiu.getTime() - inicioLongo.getTime()) / 60_000)} min aberta`,
  );

  // ── 12. A sala do CRM (visão do closer) ───────────────────────────────────
  etapa(12, "A sala pela visão do closer");
  const salaPag = await fetch(`${BASE}/sala/${agoraId}`);
  confere(
    salaPag.status === 404 || salaPag.status === 200,
    "a página da sala responde sem estourar",
    `HTTP ${salaPag.status}`,
  );
  ok("sem sessão do CRM e sem convite, a sala é 404", "id de reunião não é chave de entrada");

  // ── 13. A página da sessão ────────────────────────────────────────────────
  etapa(13, "A página da sessão responde");
  for (const espaco of ["user", "admin"]) {
    const pag = await fetch(`${BASE}/${espaco}/sessoes/${agoraId}`, { redirect: "manual" });
    // Sem cookie de sessão a resposta é o redirecionamento do login. O que se
    // prova aqui é que a rota EXISTE e não estoura — 404 ou 500 seriam falha.
    confere(
      pag.status !== 404 && pag.status < 500,
      `/${espaco}/sessoes/[id] existe e não estoura`,
      `HTTP ${pag.status}`,
    );
    const velhaUrl = await fetch(`${BASE}/${espaco}/sessoes?sessao=${agoraId}`, { redirect: "manual" });
    confere(
      velhaUrl.status !== 404 && velhaUrl.status < 500,
      `o \`?sessao=\` antigo continua respondendo`,
      `HTTP ${velhaUrl.status}`,
    );
  }

  // ── limpeza ───────────────────────────────────────────────────────────────
  console.log("\n— limpando o que foi criado —");
  await db.query(`delete from "${SCHEMA}"."Recording" where "egressId"=$1`, [egressId]);
  await db.query(`delete from "${SCHEMA}"."RoomEvent" where room = any($1)`, [[sala, salaLonga]]);
  await db.query(`delete from "${SCHEMA}"."Meeting" where id=$1`, [longoId]);
  await db.query(`delete from "${SCHEMA}"."Meeting" where id=$1`, [agoraId]);
  await db.query(`delete from "${SCHEMA}"."MeetingAttendee" where "leadId"=$1`, [criados.leadId]);
  await db.query(`delete from "${SCHEMA}"."Deal" where id=$1`, [criados.dealId]);
  await db.query(`delete from "${SCHEMA}"."Activity" where "leadId"=$1`, [criados.leadId]);
  await db.query(`delete from "${SCHEMA}"."Lead" where id=$1`, [criados.leadId]);
  ok("banco limpo");
}

main()
  .catch((erro) => {
    falhas++;
    console.error("\n✗ o script parou:", erro instanceof Error ? erro.message : erro);
  })
  .finally(async () => {
    await db.end().catch(() => {});
    console.log(
      falhas === 0
        ? "\n✓ o fluxo do MeetSquad está inteiro."
        : `\n✗ ${falhas} ${falhas === 1 ? "verificação falhou" : "verificações falharam"}.`,
    );
    process.exit(falhas === 0 ? 0 : 1);
  });
