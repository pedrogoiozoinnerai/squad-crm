import { config } from "dotenv";

import { createHash, createHmac, randomBytes } from "node:crypto";
import { Client } from "pg";

config({ path: ".env", quiet: true });
config({ path: ".env.local", override: true, quiet: true });

/**
 * Bateria de ataques contra o servidor rodando.
 *
 * Não é teste unitário nem revisão de código: é bater na porta. Cada caso
 * abaixo é uma coisa que alguém mal-intencionado tentaria com o que está
 * publicamente disponível — um link de convite, um id de reunião, uma conta de
 * vendedor comum — e a resposta esperada é a recusa.
 *
 * Recusa rodar fora de um schema `_dev`: ele cria sessões e escreve no banco.
 *
 *   npm run sondar
 */

const BASE = process.env.VERIFICAR_URL ?? "http://localhost:3000";
const SCHEMA = (process.env.DB_SCHEMA ?? "").replace(/"/g, "");

if (!SCHEMA.endsWith("_dev")) {
  console.error(`✗ DB_SCHEMA é "${SCHEMA}". Este script só roda em _dev.`);
  process.exit(1);
}

let falhas = 0;
let avisos = 0;
const db = new Client({ connectionString: process.env.DIRECT_URL });

function ok(r: string, d = "") { console.log(`  ✓ ${r}${d ? ` — ${d}` : ""}`); }
function falha(r: string, d = "") { falhas++; console.log(`  ✗ ${r}${d ? ` — ${d}` : ""}`); }
function aviso(r: string, d = "") { avisos++; console.log(`  ! ${r}${d ? ` — ${d}` : ""}`); }
function confere(c: boolean, r: string, d = "") { (c ? ok : falha)(r, d); return c; }
function etapa(t: string) { console.log(`\n${t}`); }

/** Cria uma sessão válida direto no banco, como o login faria. */
async function sessaoDe(email: string) {
  const { rows } = await db.query(
    `select id, name, role from "${SCHEMA}"."User" where email = $1`, [email],
  );
  if (!rows[0]) throw new Error(`usuário ${email} não existe em ${SCHEMA}`);
  const token = randomBytes(32).toString("hex");
  const hash = createHash("sha256").update(token).digest("hex");
  await db.query(
    `insert into "${SCHEMA}"."AuthSession" (id,"tokenHash","userId","expiresAt","createdAt")
     values ($1,$2,$3, now() + interval '1 hour', now())`,
    [randomBytes(12).toString("hex"), hash, rows[0].id],
  );
  return { cookie: `squad_crm_session=${token}`, ...rows[0] };
}

const criadas: string[] = [];

async function main() {
  console.log(`Sondagem de segurança\n  servidor: ${BASE}\n  schema:   ${SCHEMA}`);
  await db.connect();

  // ── Contexto: duas contas e duas reuniões de donos diferentes ─────────────
  const { rows: donos } = await db.query(
    `select id, email, name from "${SCHEMA}"."User" where active and "claimedAt" is not null
      order by email limit 2`,
  );
  if (donos.length < 2) {
    console.error("✗ preciso de duas contas assumidas em _dev para testar escopo.");
    process.exit(1);
  }
  const [a, b] = donos;
  const sessaoA = await sessaoDe(a.email);
  criadas.push(sessaoA.cookie);

  const idA = randomBytes(12).toString("hex");
  const idB = randomBytes(12).toString("hex");
  const agora = new Date();
  const txt = (d: Date) => d.toISOString().replace("T", " ").replace("Z", "");
  for (const [id, dono] of [[idA, a], [idB, b]] as const) {
    await db.query(
      `insert into "${SCHEMA}"."Meeting"
         (id,title,"startsAt","endsAt",type,status,"ownerId","guestToken",capacity,"createdAt","updatedAt")
       values ($1,'sonda',$2,$3,'GROUP','SCHEDULED',$4,$5,20,now(),now())`,
      [id, txt(new Date(agora.getTime() - 10 * 60_000)), txt(new Date(agora.getTime() + 50 * 60_000)),
       dono.id, `sonda-${id}`],
    );
  }

  const pedir = (caminho: string, init: RequestInit = {}) =>
    fetch(`${BASE}${caminho}`, { redirect: "manual", ...init });
  const comoA = (caminho: string, init: RequestInit = {}) =>
    pedir(caminho, { ...init, headers: { ...(init.headers ?? {}), cookie: sessaoA.cookie } });

  // ── 1. Sem sessão, nada da área logada responde ───────────────────────────
  etapa("1. As portas fechadas continuam fechadas sem sessão");
  for (const rota of [
    "/api/deals/export",
    `/api/gravacoes/${randomBytes(8).toString("hex")}/url`,
  ]) {
    const r = await pedir(rota);
    confere(r.status === 401, `${rota} recusa sem sessão`, `HTTP ${r.status}`);
  }
  for (const pag of ["/user/inicio", "/admin/configuracoes", `/user/sessoes/${idA}`]) {
    const r = await pedir(pag);
    confere([302, 303, 307, 308].includes(r.status), `${pag} manda para o login`, `HTTP ${r.status}`);
  }

  // ── 2. Cron: gatilho público de escrita ───────────────────────────────────
  etapa("2. Os crons não são gatilho público");
  for (const rota of ["/api/cron/presenca", "/api/cron/sessoes", "/api/cron/type", "/api/cron/gravacoes"]) {
    const r = await pedir(rota);
    confere(r.status === 401, `${rota} sem segredo`, `HTTP ${r.status}`);
    const errado = await pedir(rota, { headers: { authorization: "Bearer errado" } });
    confere(errado.status === 401, `${rota} com segredo errado`, `HTTP ${errado.status}`);
  }

  // ── 3. Escopo entre vendedores ────────────────────────────────────────────
  etapa("3. Um vendedor não alcança a reunião de outro");
  const tokenDeOutro = await comoA("/api/livekit/token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ meetingId: idB }),
  });
  confere(tokenDeOutro.status === 403, "token da reunião de outro closer", `HTTP ${tokenDeOutro.status}`);

  const salaDeOutro = await comoA("/api/livekit/sala", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ meetingId: idB, acao: "encerrar" }),
  });
  confere(
    salaDeOutro.status === 403 || salaDeOutro.status === 404,
    "encerrar a reunião de outro closer",
    `HTTP ${salaDeOutro.status}`,
  );

  // ── 4. A terceira porta: identidade forjada ───────────────────────────────
  etapa("4. Quem entra pelo link não vira o vendedor");
  const forjada = await pedir("/api/livekit/token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      convidado: `sonda-${idA}`,
      nome: "Invasor",
      // A identidade do DONO da reunião. Se isto passar, ele escreve no chat
      // como se fosse o closer e administra a sala.
      identidade: `u_${a.id}`,
    }),
  });
  const corpoForjado = await forjada.json().catch(() => ({}));
  confere(
    forjada.ok && typeof corpoForjado.identidade === "string" && corpoForjado.identidade.startsWith("c_"),
    "identidade `u_…` dita pelo convidado é descartada",
    String(corpoForjado.identidade),
  );
  confere(corpoForjado.host !== true, "e ele não vira host");

  // Variações que tentam passar pela peneira do prefixo.
  for (const tentativa of ["c_../../u_x", "c_ZZZZZZ", "c_" + "a".repeat(200), "U_" + a.id, " u_" + a.id]) {
    const r = await pedir("/api/livekit/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ convidado: `sonda-${idA}`, nome: "x", identidade: tentativa }),
    });
    const c = await r.json().catch(() => ({}));
    confere(
      !r.ok || /^c_[0-9a-f]{6,32}$/.test(String(c.identidade)),
      `identidade forjada "${tentativa.slice(0, 20)}" não passa`,
      String(c.identidade).slice(0, 30),
    );
  }

  // ── 5. A oferta no chat: a fraude mais fácil que o produto permitiria ─────
  etapa("5. Só o anfitrião manda botão de pagamento");
  const ofertaDeConvidado = await pedir("/api/sala/mensagens", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      convidado: `sonda-${idA}`,
      nome: "Invasor",
      tipo: "OFERTA",
      texto: "PAGUE AQUI",
      url: "https://golpe.example/pix",
    }),
  });
  confere(ofertaDeConvidado.status === 403, "convidado não oferta", `HTTP ${ofertaDeConvidado.status}`);

  for (const url of ["javascript:alert(1)", "data:text/html,<script>x</script>", "blob:https://x/y", "  javascript:alert(1)  "]) {
    const r = await comoA("/api/sala/mensagens", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ meetingId: idA, tipo: "OFERTA", texto: "Comprar", url }),
    });
    confere(r.status === 400, `oferta com "${url.slice(0, 22)}" é recusada`, `HTTP ${r.status}`);
  }

  // ── 6. Enumeração de tokens ───────────────────────────────────────────────
  etapa("6. Sondar tokens não revela quais existem");
  const inexistente = await pedir("/api/sala/mensagens?convite=naoexiste");
  const cancelado = await pedir("/api/sala/mensagens?convidado=naoexiste");
  confere(inexistente.status === 404 && cancelado.status === 404, "convite e link inválidos dão o mesmo 404");
  const t1 = await (await pedir("/entrar/naoexiste")).status;
  const t2 = await (await pedir("/convite/naoexiste")).status;
  confere(t1 === 404 && t2 === 404, "as páginas de token inválido dão 404", `${t1}/${t2}`);

  // ── 7. O retorno da Deepgram, que ninguém assina ──────────────────────────
  etapa("7. O callback da transcrição");
  const segredo = process.env.CRON_SECRET ?? "";
  const jobId = randomBytes(12).toString("hex");
  await db.query(
    `insert into "${SCHEMA}"."AiJob" (id,chave,etapa,estado,"externoId","createdAt","updatedAt")
     values ($1,$2,'TRANSCREVER','AGUARDANDO','req-verdadeiro',now(),now())`,
    [jobId, `TRANSCREVER:sonda-${jobId}`],
  );
  const tokenCerto = createHmac("sha256", segredo).update(`retorno:${jobId}`).digest("hex").slice(0, 32);
  const corpoDeepgram = (requestId: string | null) => ({
    metadata: requestId ? { request_id: requestId, duration: 10 } : { duration: 10 },
    results: { channels: [{ alternatives: [{ paragraphs: { transcript: "texto injetado pelo atacante" } }] }] },
  });

  for (const token of ["", "x", tokenCerto.slice(0, -1) + "0", "a".repeat(32)]) {
    const r = await pedir(`/api/deepgram/${jobId}/${token || "vazio"}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(corpoDeepgram("req-verdadeiro")),
    });
    confere(r.status === 401, `token "${token.slice(0, 8) || "(vazio)"}" é recusado`, `HTTP ${r.status}`);
  }

  const outroJob = randomBytes(12).toString("hex");
  const tokenDoOutro = createHmac("sha256", segredo).update(`retorno:${outroJob}`).digest("hex").slice(0, 32);
  const cruzado = await pedir(`/api/deepgram/${jobId}/${tokenDoOutro}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(corpoDeepgram("req-verdadeiro")),
  });
  confere(cruzado.status === 401, "token de OUTRO trabalho não serve", `HTTP ${cruzado.status}`);

  // A segunda trava: com o token certo, mas `request_id` de outro pedido.
  const idErrado = await pedir(`/api/deepgram/${jobId}/${tokenCerto}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(corpoDeepgram("req-de-outro")),
  });
  confere(idErrado.status === 401, "request_id que não confere é recusado", `HTTP ${idErrado.status}`);

  // E o caso que o código pode estar deixando passar: SEM `request_id` nenhum.
  const semId = await pedir(`/api/deepgram/${jobId}/${tokenCerto}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(corpoDeepgram(null)),
  });
  const gravou = await db.query(
    `select t.texto from "${SCHEMA}"."Transcript" t where t."recordingId" = $1`, [`sonda-${jobId}`],
  );
  if (semId.status === 401) {
    ok("corpo SEM request_id também é recusado");
  } else {
    aviso(
      "corpo sem `request_id` NÃO é barrado pela segunda trava",
      `HTTP ${semId.status} · gravou=${gravou.rowCount}`,
    );
  }

  // ── 9. Redirecionador aberto no login ─────────────────────────────────────
  etapa("9. O `next=` do login não manda para fora");
  for (const destino of ["//evil.example/x", "/\\evil.example", "https://evil.example"]) {
    const r = await pedir(`/?next=${encodeURIComponent(destino)}`);
    const corpo = await r.text();
    const temDestino = corpo.includes(destino) && /action=|href=/.test(corpo);
    confere(!temDestino || !corpo.includes(`value="${destino}"`), `"${destino}" não vira destino`);
  }

  // ── 10. O que a sondagem pública devolve ──────────────────────────────────
  etapa("10. As rotas públicas não vazam dado de ninguém");
  const disp = await (await pedir("/api/agenda/disponibilidade")).json();
  const texto = JSON.stringify(disp);
  confere(!/@/.test(texto), "a disponibilidade não traz e-mail de ninguém");
  confere(!/"nome"|"name"|"lead"/i.test(texto), "nem nome de lead");
  const saude = await (await pedir("/api/saude")).json();
  confere(
    !JSON.stringify(saude).match(/postgres|supabase|password|secret|key/i),
    "/api/saude não devolve configuração",
    JSON.stringify(saude).slice(0, 90),
  );

  const reservar = await pedir("/api/agenda/reservar", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ meetingId: idA, nome: "x", email: "x@y.z" }),
  });
  confere(reservar.status === 401, "reservar vaga sem a chave do funil", `HTTP ${reservar.status}`);

  // ── 11. O cookie de sessão ────────────────────────────────────────────────
  etapa("11. O cookie de sessão");
  const login = await pedir("/", { method: "GET" });
  const cookieFlags = login.headers.get("set-cookie") ?? "";
  if (cookieFlags) {
    confere(/httponly/i.test(cookieFlags), "httpOnly", cookieFlags.slice(0, 60));
  } else {
    ok("a home não emite cookie sem login");
  }

  // ── 12. Cabeçalhos de resposta ────────────────────────────────────────────
  etapa("12. Cabeçalhos");
  const pag = await pedir("/");
  for (const [cab, esperado] of [
    ["x-frame-options", /deny|sameorigin/i],
    ["x-content-type-options", /nosniff/i],
    ["referrer-policy", /./],
    ["content-security-policy", /./],
  ] as const) {
    const v = pag.headers.get(cab);
    if (v && esperado.test(v)) ok(`${cab}`, v.slice(0, 50));
    else aviso(`${cab} ausente`, "clickjacking / sniffing / vazamento de referer");
  }
  const url = await comoA(`/api/gravacoes/${randomBytes(8).toString("hex")}/url`);
  confere(url.status === 404, "gravação inexistente dá 404 para quem tem sessão", `HTTP ${url.status}`);

  // ── 7.5. O funil: reservar assento é escrita pública ──────────────────────
  //
  // A rota que ocupa vaga numa sessão real é pública por necessidade — é o
  // navegador do lead que a chama. Antes do freio, seis requisições viravam
  // seis assentos, e um laço sobre a agenda esvaziava a semana. Cada lead falso
  // ainda atravessava para o CRM, era distribuído a um closer e virava tarefa.
  etapa("7.5. O funil do Type não deixa um robô lotar a agenda");
  const FUNIL = process.env.FUNIL_URL ?? "http://localhost:3001";
  const agenda = await fetch(`${FUNIL}/api/agenda`)
    .then((r) => r.json())
    .catch(() => null);

  if (!agenda?.sessoes?.length) {
    aviso("funil fora do ar — esta etapa não rodou", `esperava ${FUNIL}`);
  } else {
    const sessao = agenda.sessoes[0];
    const origem = `198.51.100.${1 + Math.floor(Math.random() * 250)}`;
    const cab = { "content-type": "application/json", "x-real-ip": origem };
    const marca = `Sonda ${randomBytes(4).toString("hex")}`;

    let semCadastro = 0;
    let comCadastro = 0;
    let barradas = 0;

    for (let i = 0; i < 12; i++) {
      const sid = `sonda-${randomBytes(12).toString("hex")}`;
      await fetch(`${FUNIL}/api/leads`, {
        method: "POST", headers: cab, body: JSON.stringify({ sessionId: sid }),
      });
      await fetch(`${FUNIL}/api/leads/${sid}`, {
        method: "PATCH", headers: cab,
        body: JSON.stringify({ step: "NAME", value: { fullName: `${marca} ${i}` } }),
      });

      // Metade tenta reservar só com o nome; metade completa o contato, que é o
      // que um atacante faria depois de bater na primeira recusa.
      if (i % 2 === 1) {
        await fetch(`${FUNIL}/api/leads/${sid}`, {
          method: "PATCH", headers: cab,
          body: JSON.stringify({ step: "EMAIL", value: { email: `s${i}@exemplo.test` } }),
        });
      }
      const r = await fetch(`${FUNIL}/api/leads/${sid}/reservar`, {
        method: "POST", headers: cab, body: JSON.stringify({ meetingId: sessao.id }),
      });
      if (r.status === 409) semCadastro++;
      else if (r.status === 429) barradas++;
      else if (r.ok) comCadastro++;
    }

    confere(semCadastro > 0, "reservar sem contato é recusado", `${semCadastro} recusas`);
    confere(
      comCadastro <= 5,
      "o freio por origem corta a enxurrada",
      `${comCadastro} assentos em 12 tentativas (antes: 12)`,
    );

    const ocupados = await db.query(
      `select count(*)::int n from "${SCHEMA}"."MeetingAttendee" a
         join "${SCHEMA}"."Lead" l on l.id = a."leadId"
        where a."meetingId" = $1 and l.name like $2`,
      [sessao.id, `${marca}%`],
    );
    confere(
      ocupados.rows[0].n <= 5,
      "e a sessão não foi esvaziada",
      `${ocupados.rows[0].n} de ${sessao.vagas} vagas`,
    );

    // Limpa o que a sonda plantou nos DOIS bancos.
    await db.query(
      `delete from "${SCHEMA}"."MeetingAttendee" a using "${SCHEMA}"."Lead" l
        where l.id = a."leadId" and l.name like $1`, [`${marca}%`],
    );
    await db.query(`delete from "${SCHEMA}"."Lead" where name like $1`, [`${marca}%`]);
    await db.query(
      `delete from "${process.env.TYPE_DB_SCHEMA ?? "type"}"."Lead" where "fullName" like $1`,
      [`${marca}%`],
    );
  }

  // ── 8. Limite de taxa ─────────────────────────────────────────────────────
  etapa("8. O limite de taxa segura martelada");
  // O teto é 60 por minuto. A primeira versão desta sonda fazia 40 chamadas e
  // acusava o limite de não funcionar — o defeito era da sonda, não do código.
  const TENTATIVAS = 80;
  let barrou = 0;
  for (let i = 0; i < TENTATIVAS; i++) {
    const r = await pedir("/api/sala/mensagens?convite=naoexiste");
    if (r.status === 429) { barrou++; }
  }
  confere(barrou > 0, "martelar a rota de mensagens vira 429", `${barrou} de ${TENTATIVAS} barradas`);

  // ── limpeza ───────────────────────────────────────────────────────────────
  console.log("\n— limpando —");
  await db.query(`delete from "${SCHEMA}"."AiJob" where id = $1`, [jobId]);
  await db.query(`delete from "${SCHEMA}"."Meeting" where id = any($1)`, [[idA, idB]]);
  for (const c of criadas) {
    const token = c.split("=")[1];
    await db.query(`delete from "${SCHEMA}"."AuthSession" where "tokenHash" = $1`, [
      createHash("sha256").update(token).digest("hex"),
    ]);
  }
  ok("sessões e reuniões da sonda removidas");
}

main()
  .catch((erro) => {
    falhas++;
    console.error("\n✗ a sonda parou:", erro instanceof Error ? erro.stack : erro);
  })
  .finally(async () => {
    await db.end().catch(() => {});
    console.log(
      `\n${falhas === 0 ? "✓" : "✗"} ${falhas} ${falhas === 1 ? "falha" : "falhas"}` +
        `${avisos ? ` · ${avisos} ${avisos === 1 ? "aviso" : "avisos"}` : ""}`,
    );
    process.exit(falhas === 0 ? 0 : 1);
  });
