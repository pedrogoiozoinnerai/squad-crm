import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import { env, envObrigatorio, identificador } from "../src/lib/env";
import { associacoes, buscar, lote, owners } from "./hubspot-client";
import { PIPELINES, destinoDe, type Destino } from "./hubspot-mapa";

/**
 * Traz os 8 pipelines do Squad do HubSpot para cá.
 *
 *   npm run hubspot:importar                 simula, não escreve nada
 *   npm run hubspot:importar -- --aplicar    grava
 *   npm run hubspot:importar -- --limite 50  só 50 negócios por pipeline
 *   npm run hubspot:importar -- --sem-notas  pula as anotações
 *
 * Repetível por construção: tudo é upsert pela ponte de origem
 * (hubspotContactId, hubspotDealId, hubspotNoteId, hubspotOwnerId). Rodar de
 * novo atualiza o que mudou e não duplica — então a migração acontece em ondas
 * enquanto o HubSpot ainda é a fonte de verdade, e uma queda no meio se
 * resolve rodando outra vez.
 *
 * Só lê do HubSpot. Nada é escrito lá, em nenhuma circunstância.
 */
const APLICAR = process.argv.includes("--aplicar");
const SEM_NOTAS = process.argv.includes("--sem-notas");
const LIMITE = (() => {
  const i = process.argv.indexOf("--limite");
  return i >= 0 ? Number(process.argv[i + 1]) : Infinity;
})();

const SCHEMA = identificador("DB_SCHEMA", env("DB_SCHEMA", "crm")!);

/**
 * Mais de uma conexão porque são ~28 mil escritas: com `max: 1` cada uma espera
 * a anterior e a carga leva horas. Oito é folgado para o pooler do Supabase em
 * modo transaction e mantém a importação na casa dos minutos.
 */
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: envObrigatorio("DATABASE_URL"), max: 8 }, { schema: SCHEMA }),
});

const PROPS_NEGOCIO = ["dealname", "amount", "dealstage", "pipeline", "hubspot_owner_id", "createdate", "closedate", "description"];
const PROPS_CONTATO = ["firstname", "lastname", "email", "phone", "mobilephone", "company", "jobtitle", "createdate"];
const PROPS_NOTA = ["hs_note_body", "hs_timestamp", "hubspot_owner_id"];

/** Código estável: derivado do id do HubSpot, igual em toda reimportação. */
const codigoDe = (id: string) => `#h${Number(id).toString(36)}`;

const centavos = (v: string | null | undefined) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
};

const data = (v: string | null | undefined) => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** O corpo da anotação vem como HTML do editor do HubSpot. */
const texto = (html: string | null | undefined) =>
  (html ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();

/**
 * Executa em paralelo com teto. Sem teto, 9.500 upserts simultâneos derrubam o
 * pooler; sequencial leva horas. Erro de um item não cancela os outros — ele é
 * contado e a importação segue, porque rodar de novo conserta o que faltou.
 */
async function comTeto<T>(itens: T[], teto: number, tarefa: (item: T) => Promise<void>, aoAndar: (feitos: number) => void) {
  let i = 0;
  let feitos = 0;
  const falhas: string[] = [];
  await Promise.all(
    Array.from({ length: Math.min(teto, itens.length) }, async () => {
      while (i < itens.length) {
        const meu = itens[i++];
        try {
          await tarefa(meu);
        } catch (e) {
          falhas.push((e as Error).message.slice(0, 160));
        }
        if (++feitos % 250 === 0) aoAndar(feitos);
      }
    }),
  );
  return falhas;
}

type Negocio = { id: string; props: Record<string, string | null>; pipelineId: string; destino: Destino; rotulo: string };

async function main() {
  const t0 = Date.now();
  console.log(`\n  schema ${SCHEMA} · ${APLICAR ? "GRAVANDO" : "simulação (nada é escrito)"}`);
  if (LIMITE !== Infinity) console.log(`  limite de ${LIMITE} negócios por pipeline`);

  // ─── 1. Responsáveis ───────────────────────────────────────────────────
  // Conta sem senha = conta não assumida: quem já trabalha aqui se cadastra
  // com o mesmo e-mail e herda tudo que já aponta para ela.
  const donos = new Map<string, string>();
  const listaDonos = (await owners()).filter((o) => !o.archived && o.email);
  if (APLICAR) {
    for (const o of listaDonos) {
      const nome = `${o.firstName ?? ""} ${o.lastName ?? ""}`.trim() || o.email.split("@")[0];
      const u = await prisma.user.upsert({
        where: { email: o.email.toLowerCase() },
        update: { hubspotOwnerId: String(o.id) },
        create: { email: o.email.toLowerCase(), name: nome, passwordHash: "", hubspotOwnerId: String(o.id) },
      });
      donos.set(String(o.id), u.id);
    }
  } else {
    for (const o of listaDonos) donos.set(String(o.id), "simulado");
  }

  // Dono de aterrissagem para quem não tem responsável no HubSpot. Inativo de
  // propósito: não vira opção de atribuição, mas filtra no pipeline.
  let naoAtribuido = "simulado";
  if (APLICAR) {
    naoAtribuido = (
      await prisma.user.upsert({
        where: { email: "nao-atribuido@innerai.com" },
        update: {},
        create: { email: "nao-atribuido@innerai.com", name: "Não atribuído", passwordHash: "", active: false },
      })
    ).id;
  }
  console.log(`  ${listaDonos.length} responsáveis + "Não atribuído"`);

  const etapas = new Map((await prisma.stage.findMany()).map((e) => [e.key, e.id]));
  if (!etapas.get("fechamento")) throw new Error("Catálogo de etapas ausente. Rode 'npm run db:seed' antes.");

  // ─── 2. Ler tudo do HubSpot antes de escrever ──────────────────────────
  // O de-para é validado aqui, com a leitura ainda em memória: etapa
  // desconhecida derruba a importação ANTES de gravar meia base.
  console.log("\n  lendo do HubSpot…");
  const negocios: Negocio[] = [];
  for (const [pipelineId, meta] of Object.entries(PIPELINES)) {
    let n = 0;
    for await (const pagina of buscar("deals", [{ propertyName: "pipeline", operator: "EQ", value: pipelineId }], PROPS_NEGOCIO)) {
      for (const d of pagina) {
        if (n >= LIMITE) break;
        const [rotulo, destino] = destinoDe(d.properties.dealstage ?? "", pipelineId);
        negocios.push({ id: d.id, props: d.properties, pipelineId, destino, rotulo });
        n++;
      }
      if (n >= LIMITE) break;
    }
    console.log(`    ${meta.nome.padEnd(24)} ${String(n).padStart(5)}`);
  }

  const assoc = await associacoes("deals", "contacts", negocios.map((n) => n.id));
  const idsContato = [...new Set([...assoc.values()].flat())];
  const contatos = new Map((await lote("contacts", idsContato, PROPS_CONTATO)).map((c) => [c.id, c.properties]));
  console.log(`    ${negocios.length} negócios · ${contatos.size} contatos`);

  // ─── 3. Agrupar por lead ───────────────────────────────────────────────
  // Dois negócios do mesmo contato não podem correr em paralelo: os dois
  // fariam upsert do mesmo lead e um perderia a corrida com violação de
  // unicidade. Cada grupo é sequencial; os grupos é que correm juntos.
  const grupos = new Map<string, Negocio[]>();
  for (const n of negocios) {
    const contatoId = (assoc.get(n.id) ?? [])[0];
    const chave = contatoId ?? `deal-${n.id}`;
    (grupos.get(chave) ?? grupos.set(chave, []).get(chave)!).push(n);
  }
  const semDono = negocios.filter((n) => !n.props.hubspot_owner_id || !donos.get(n.props.hubspot_owner_id)).length;
  const orfaos = negocios.filter((n) => !(assoc.get(n.id) ?? [])[0]).length;
  console.log(`    ${grupos.size} leads · ${semDono} sem dono · ${orfaos} sem contato`);

  if (!APLICAR) {
    console.log(`\n  Nada foi escrito. Repita com --aplicar.\n`);
    return;
  }

  // ─── 4. Gravar ─────────────────────────────────────────────────────────
  console.log("\n  gravando…");
  const idPorHubspotDeal = new Map<string, string>();
  const idPorHubspotContato = new Map<string, string>();

  const falhas = await comTeto([...grupos.entries()], 8, async ([chave, doGrupo]) => {
    const contato = contatos.get(chave);
    const primeiro = doGrupo[0];
    const nome =
      [contato?.firstname, contato?.lastname].filter(Boolean).join(" ").trim() ||
      contato?.email ||
      primeiro.props.dealname ||
      "Sem nome";
    const donoHs = primeiro.props.hubspot_owner_id;
    const ownerIdLead = (donoHs && donos.get(donoHs)) || naoAtribuido;

    const lead = await prisma.lead.upsert({
      where: { hubspotContactId: chave },
      update: {
        name: nome,
        email: contato?.email ?? undefined,
        phone: contato?.phone ?? contato?.mobilephone ?? undefined,
        company: contato?.company ?? undefined,
        jobTitle: contato?.jobtitle ?? undefined,
      },
      create: {
        hubspotContactId: chave,
        name: nome,
        email: contato?.email ?? null,
        phone: contato?.phone ?? contato?.mobilephone ?? null,
        company: contato?.company ?? null,
        jobTitle: contato?.jobtitle ?? null,
        status: "CONVERTED",
        source: contato ? "HubSpot" : "HubSpot (negócio sem contato)",
        ownerId: ownerIdLead,
        createdAt: data(contato?.createdate) ?? data(primeiro.props.createdate) ?? new Date(),
      },
    });
    if (contato) idPorHubspotContato.set(chave, lead.id);

    for (const n of doGrupo) {
      const ganho = n.destino.tipo === "ganho";
      const perdido = n.destino.tipo === "perdido";
      // Sem data de fechamento no HubSpot, cai para a de criação. Negócio
      // ganho com wonAt nulo existe no total mas some de qualquer série
      // temporal — o Dashboard o perderia sem ninguém notar.
      const criadoEm = data(n.props.createdate) ?? new Date();
      const fechadoEm = data(n.props.closedate) ?? criadoEm;
      const dono = (n.props.hubspot_owner_id && donos.get(n.props.hubspot_owner_id)) || naoAtribuido;

      const campos = {
        stageId: ganho || perdido ? etapas.get("fechamento")! : etapas.get((n.destino as { etapa: string }).etapa)!,
        status: ganho ? ("WON" as const) : perdido ? ("LOST" as const) : ("OPEN" as const),
        valueCents: centavos(n.props.amount),
        product: n.props.dealname ?? null,
        expectedAt: fechadoEm,
        wonAt: ganho ? fechadoEm : null,
        lostAt: perdido ? fechadoEm : null,
        ownerId: dono,
      };

      const salvo = await prisma.deal.upsert({
        where: { hubspotDealId: n.id },
        update: campos,
        create: {
          ...campos,
          hubspotDealId: n.id,
          code: codigoDe(n.id),
          leadId: lead.id,
          createdAt: criadoEm,
        },
      });
      idPorHubspotDeal.set(n.id, salvo.id);

      // A etapa de origem some no de-para — oito pipelines viram um. Vai como
      // anotação, não em `lostNote`: aquele campo é do motivo de perda e a
      // ação de marcar ganho o limpa, então a origem sumiria na primeira
      // vez que alguém mexesse no negócio.
      await prisma.note.upsert({
        where: { hubspotNoteId: `origem-${n.id}` },
        update: {},
        create: {
          hubspotNoteId: `origem-${n.id}`,
          content:
            `Importado do HubSpot · pipeline "${PIPELINES[n.pipelineId].nome}" · etapa "${n.rotulo}"` +
            (n.props.description ? `\n\n${texto(n.props.description)}` : ""),
          createdAt: criadoEm,
          authorId: naoAtribuido,
          dealId: salvo.id,
          leadId: lead.id,
        },
      });
    }
  }, (feitos) => process.stdout.write(`\r    ${feitos}/${grupos.size} leads`));

  process.stdout.write(`\r    ${grupos.size}/${grupos.size} leads\n`);
  if (falhas.length) {
    console.log(`\n  ⚠ ${falhas.length} grupos falharam. Os três primeiros:`);
    for (const f of falhas.slice(0, 3)) console.log(`      ${f}`);
    console.log(`    Rodar de novo reprocessa só o que faltou.`);
  }

  // ─── 5. Anotações ──────────────────────────────────────────────────────
  if (!SEM_NOTAS) {
    console.log("\n  anotações…");
    const notasDeNegocio = await associacoes("deals", "notes", [...idPorHubspotDeal.keys()]);
    const idsNota = [...new Set([...notasDeNegocio.values()].flat())];
    console.log(`    ${idsNota.length} anotações associadas a negócios`);

    if (idsNota.length) {
      const porNota = new Map<string, string>(); // notaId → hubspotDealId
      for (const [dealId, notas] of notasDeNegocio) for (const nota of notas) porNota.set(nota, dealId);

      const corpos = await lote("notes", idsNota, PROPS_NOTA);
      const falhasNota = await comTeto(corpos, 8, async (nota) => {
        const conteudo = texto(nota.properties.hs_note_body);
        if (!conteudo) return;
        const hubspotDealId = porNota.get(nota.id)!;
        const dealId = idPorHubspotDeal.get(hubspotDealId);
        if (!dealId) return;
        const autor = (nota.properties.hubspot_owner_id && donos.get(nota.properties.hubspot_owner_id)) || naoAtribuido;
        await prisma.note.upsert({
          where: { hubspotNoteId: nota.id },
          update: { content: conteudo },
          create: {
            hubspotNoteId: nota.id,
            content: conteudo,
            createdAt: data(nota.properties.hs_timestamp) ?? new Date(),
            authorId: autor,
            dealId,
          },
        });
      }, (feitos) => process.stdout.write(`\r    ${feitos}/${corpos.length}`));
      process.stdout.write(`\r    ${corpos.length}/${corpos.length} anotações\n`);
      if (falhasNota.length) console.log(`    ⚠ ${falhasNota.length} anotações falharam`);
    }
  }

  const [leads, deals, notas] = await Promise.all([prisma.lead.count(), prisma.deal.count(), prisma.note.count()]);
  console.log(`\n  ─────────────────────────────`);
  console.log(`  leads      ${leads}`);
  console.log(`  negócios   ${deals}`);
  console.log(`  anotações  ${notas}`);
  console.log(`\n  Gravado em ${SCHEMA} em ${Math.round((Date.now() - t0) / 1000)}s. Rodar de novo atualiza, não duplica.\n`);
}

main()
  .catch((e) => { console.error("\n✗", e.message, "\n"); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
