import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import { env, envObrigatorio, identificador } from "../src/lib/env";
import { associacoes, buscar, lote, owners } from "./hubspot-client";
import { PIPELINES, destinoDe } from "./hubspot-mapa";

/**
 * Traz os 8 pipelines do Squad do HubSpot para cá.
 *
 *   npm run hubspot:importar                    simula, não escreve nada
 *   npm run hubspot:importar -- --aplicar       grava
 *   npm run hubspot:importar -- --limite 50     só 50 negócios por pipeline
 *
 * Repetível por construção: tudo é upsert pela ponte de origem
 * (hubspotContactId, hubspotDealId, hubspotOwnerId). Rodar de novo atualiza o
 * que mudou e não duplica nada — então a migração pode acontecer em ondas,
 * enquanto o HubSpot segue sendo a fonte de verdade.
 *
 * Só lê do HubSpot. Nada é escrito lá, em nenhuma circunstância.
 */
const APLICAR = process.argv.includes("--aplicar");
const LIMITE = (() => {
  const i = process.argv.indexOf("--limite");
  return i >= 0 ? Number(process.argv[i + 1]) : Infinity;
})();

const SCHEMA = identificador("DB_SCHEMA", env("DB_SCHEMA", "crm")!);
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: envObrigatorio("DATABASE_URL"), max: 1 }, { schema: SCHEMA }),
});

const PROPS_NEGOCIO = ["dealname", "amount", "dealstage", "pipeline", "hubspot_owner_id", "createdate", "closedate", "description"];
const PROPS_CONTATO = ["firstname", "lastname", "email", "phone", "mobilephone", "company", "jobtitle", "hubspot_owner_id", "createdate", "hs_analytics_source", "lifecyclestage"];

/** Código estável: derivado do id do HubSpot, igual em toda reimportação. */
const codigoDe = (hubspotId: string) => `#h${Number(hubspotId).toString(36)}`;

const centavos = (valor: string | null) => {
  const n = Number(valor);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
};

const data = (valor: string | null) => {
  if (!valor) return null;
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
};

const conta = { usuarios: 0, leads: 0, negocios: 0, semDono: 0, orfaos: 0, pulados: 0 };

async function main() {
  console.log(`\n  schema ${SCHEMA} · ${APLICAR ? "GRAVANDO" : "simulação (nada é escrito)"}`);
  if (LIMITE !== Infinity) console.log(`  limite de ${LIMITE} negócios por pipeline`);

  // ─── 1. Responsáveis ───────────────────────────────────────────────────
  // Conta sem senha = conta não assumida: quem já trabalha aqui se cadastra
  // com o mesmo e-mail e herda tudo que já aponta para ela.
  const donos = new Map<string, string>(); // hubspotOwnerId → userId
  for (const o of await owners()) {
    if (o.archived || !o.email) continue;
    const nome = `${o.firstName ?? ""} ${o.lastName ?? ""}`.trim() || o.email.split("@")[0];
    if (APLICAR) {
      const u = await prisma.user.upsert({
        where: { email: o.email.toLowerCase() },
        update: { hubspotOwnerId: String(o.id) },
        create: { email: o.email.toLowerCase(), name: nome, passwordHash: "", hubspotOwnerId: String(o.id) },
      });
      donos.set(String(o.id), u.id);
    } else {
      donos.set(String(o.id), "simulado");
    }
    conta.usuarios++;
  }

  // Dono de aterrissagem para os 41% sem responsável no HubSpot. Inativo de
  // propósito: não aparece como opção de atribuição, mas filtra no pipeline.
  let naoAtribuido = "simulado";
  if (APLICAR) {
    const u = await prisma.user.upsert({
      where: { email: "nao-atribuido@innerai.com" },
      update: {},
      create: { email: "nao-atribuido@innerai.com", name: "Não atribuído", passwordHash: "", active: false },
    });
    naoAtribuido = u.id;
  }
  console.log(`  ${conta.usuarios} responsáveis + 1 "Não atribuído"`);

  // ─── 2. Etapas do nosso pipeline ───────────────────────────────────────
  const etapas = new Map((await prisma.stage.findMany()).map((e) => [e.key, e.id]));
  const fechamento = etapas.get("fechamento");
  if (!fechamento) throw new Error("Catálogo de etapas ausente. Rode 'npm run db:seed' antes.");

  // ─── 3. Um pipeline por vez ────────────────────────────────────────────
  for (const [pipelineId, meta] of Object.entries(PIPELINES)) {
    const negocios: { id: string; props: Record<string, string | null> }[] = [];
    for await (const pagina of buscar("deals", [{ propertyName: "pipeline", operator: "EQ", value: pipelineId }], PROPS_NEGOCIO)) {
      for (const d of pagina) {
        if (negocios.length >= LIMITE) break;
        negocios.push({ id: d.id, props: d.properties });
      }
      if (negocios.length >= LIMITE) break;
    }
    if (!negocios.length) { console.log(`  ${meta.nome.padEnd(24)} vazio`); continue; }

    // Contatos de cada negócio, e depois os contatos em si — dois lotes, não
    // uma chamada por registro.
    const assoc = await associacoes("deals", "contacts", negocios.map((n) => n.id));
    const idsContato = [...new Set([...assoc.values()].flat())];
    const contatos = new Map(
      (await lote("contacts", idsContato, PROPS_CONTATO)).map((c) => [c.id, c.properties]),
    );

    let n = 0;
    for (const negocio of negocios) {
      const [rotuloOrigem, destino] = destinoDe(negocio.props.dealstage ?? "", pipelineId);
      const donoHs = negocio.props.hubspot_owner_id;
      const ownerId = (donoHs && donos.get(donoHs)) || naoAtribuido;
      if (!donoHs || !donos.get(donoHs)) conta.semDono++;

      const contatoId = (assoc.get(negocio.id) ?? [])[0];
      const contato = contatoId ? contatos.get(contatoId) : undefined;

      // Negócio órfão: o nome do negócio quase sempre carrega empresa ou pessoa.
      const nomeLead =
        [contato?.firstname, contato?.lastname].filter(Boolean).join(" ").trim() ||
        contato?.email ||
        negocio.props.dealname ||
        "Sem nome";
      if (!contatoId) conta.orfaos++;

      const criadoEm = data(negocio.props.createdate) ?? new Date();
      const fechadoEm = data(negocio.props.closedate);
      const ganho = destino.tipo === "ganho";
      const perdido = destino.tipo === "perdido";

      if (APLICAR) {
        // O lead nasce do contato; sem contato, um lead sintético por negócio.
        const chaveLead = contatoId
          ? { hubspotContactId: contatoId }
          : { hubspotContactId: `deal-${negocio.id}` };

        const lead = await prisma.lead.upsert({
          where: chaveLead as { hubspotContactId: string },
          update: {
            name: nomeLead,
            email: contato?.email ?? undefined,
            phone: contato?.phone ?? contato?.mobilephone ?? undefined,
            company: contato?.company ?? undefined,
            jobTitle: contato?.jobtitle ?? undefined,
            ownerId,
          },
          create: {
            ...(chaveLead as { hubspotContactId: string }),
            name: nomeLead,
            email: contato?.email ?? null,
            phone: contato?.phone ?? contato?.mobilephone ?? null,
            company: contato?.company ?? null,
            jobTitle: contato?.jobtitle ?? null,
            status: "CONVERTED",
            source: contatoId ? "HubSpot" : "HubSpot (negócio sem contato)",
            ownerId,
            createdAt: data(contato?.createdate ?? null) ?? criadoEm,
          },
        });
        conta.leads++;

        const comum = {
          stageId: ganho || perdido ? fechamento : etapas.get((destino as { etapa: string }).etapa)!,
          status: ganho ? ("WON" as const) : perdido ? ("LOST" as const) : ("OPEN" as const),
          valueCents: centavos(negocio.props.amount),
          product: negocio.props.dealname ?? null,
          expectedAt: fechadoEm,
          wonAt: ganho ? fechadoEm : null,
          lostAt: perdido ? fechadoEm : null,
          ownerId,
        };

        const salvo = await prisma.deal.upsert({
          where: { hubspotDealId: negocio.id },
          update: comum,
          create: {
            ...comum,
            hubspotDealId: negocio.id,
            code: codigoDe(negocio.id),
            leadId: lead.id,
            createdAt: criadoEm,
          },
        });

        // A etapa de origem some no de-para — oito pipelines viram um. Vai como
        // anotação, não em `lostNote`: aquele campo é do motivo de perda, e a
        // ação de marcar ganho o limpa (src/app/actions/deals.ts) — a origem
        // seria apagada na primeira vez que alguém mexesse no negócio.
        await prisma.note.upsert({
          where: { hubspotNoteId: `origem-${negocio.id}` },
          update: {},
          create: {
            hubspotNoteId: `origem-${negocio.id}`,
            content:
              `Importado do HubSpot · pipeline "${meta.nome}" · etapa "${rotuloOrigem}"` +
              (negocio.props.description ? `\n\n${negocio.props.description}` : ""),
            createdAt: criadoEm,
            authorId: naoAtribuido,
            dealId: salvo.id,
            leadId: lead.id,
          },
        });
      }
      conta.negocios++;
      n++;
    }
    console.log(`  ${meta.nome.padEnd(24)} ${String(n).padStart(5)} negócios`);
  }

  console.log(`\n  ─────────────────────────────`);
  console.log(`  responsáveis   ${conta.usuarios}`);
  console.log(`  leads          ${conta.leads || "(simulação)"}`);
  console.log(`  negócios       ${conta.negocios}`);
  console.log(`  sem dono       ${conta.semDono} → "Não atribuído"`);
  console.log(`  sem contato    ${conta.orfaos} → lead criado pelo nome do negócio`);
  console.log(
    APLICAR
      ? `\n  Gravado em ${SCHEMA}. Rodar de novo atualiza, não duplica.\n`
      : `\n  Nada foi escrito. Repita com --aplicar quando os números fizerem sentido.\n`,
  );
}

main()
  .catch((e) => { console.error("\n✗", e.message, "\n"); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
