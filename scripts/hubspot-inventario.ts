import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import { env, envObrigatorio, identificador } from "../src/lib/env";
import { contar, pipelines, propriedadesDe } from "./hubspot-client";
import { PIPELINES } from "./hubspot-mapa";

/**
 * O que existe no HubSpot, o que já veio, e o que ficou de fora.
 *
 * A migração foi feita com escopo declarado: os 8 pipelines do Squad. Isso é
 * uma decisão, não um descuido — mas ela some da memória em duas semanas, e
 * "puxar tudo" só é uma frase com sentido depois de saber quanto é "tudo".
 *
 * Só lê. Não escreve nem no HubSpot nem no CRM.
 *
 *   npm run hubspot:inventario
 */

const SCHEMA = identificador("DB_SCHEMA", env("DB_SCHEMA", "crm")!);
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: envObrigatorio("DIRECT_URL") }, { schema: SCHEMA }),
});

/// Objetos do HubSpot que a importação NUNCA tocou. O nome da API vai junto
/// porque é por ele que se pede, e alguns não são óbvios (`0-5` é ticket).
const NAO_TOCADOS = [
  ["companies", "empresas"],
  ["tickets", "tickets de suporte"],
  ["calls", "ligações registradas"],
  ["emails", "e-mails registrados"],
  ["line_items", "itens de produto nos negócios"],
  ["products", "catálogo de produtos"],
  ["quotes", "propostas/orçamentos"],
] as const;

const linha = (r: string, v: unknown, nota = "") =>
  console.log(`  ${r.padEnd(34)} ${String(v).padStart(9)}  ${nota}`);

async function quantos(objeto: string): Promise<number | string> {
  try {
    return await contar(objeto as "contacts");
  } catch (e) {
    return `— (${(e as Error).message.slice(0, 40)})`;
  }
}

async function main() {
  console.log(`\n═══ INVENTÁRIO · HubSpot × CRM (${SCHEMA}) ═══\n`);

  // ── Volume bruto ─────────────────────────────────────────────────────────
  console.log("── O que existe no HubSpot\n");
  const noHub = {
    contacts: await quantos("contacts"),
    deals: await quantos("deals"),
    companies: await quantos("companies"),
  };
  linha("contatos", noHub.contacts);
  linha("negócios", noHub.deals);
  linha("empresas", noHub.companies);

  // ── O que veio ───────────────────────────────────────────────────────────
  console.log("\n── O que já está no CRM\n");
  const [leads, deals, notas, tarefas, reunioes, usuarios] = await Promise.all([
    prisma.lead.count({ where: { hubspotContactId: { not: null } } }),
    prisma.deal.count({ where: { hubspotDealId: { not: null } } }),
    prisma.note.count({ where: { hubspotNoteId: { not: null } } }),
    prisma.task.count(),
    prisma.meeting.count({ where: { hubspotMeetingId: { not: null } } }),
    prisma.user.count({ where: { hubspotOwnerId: { not: null } } }),
  ]);
  linha("leads vindos do HubSpot", leads);
  linha("negócios", deals);
  linha("anotações", notas);
  linha("tarefas", tarefas);
  linha("reuniões", reunioes);
  linha("usuários (donos)", usuarios);

  // ── A conta que importa ──────────────────────────────────────────────────
  console.log("\n── A diferença\n");
  if (typeof noHub.contacts === "number") {
    const fora = noHub.contacts - leads;
    linha("contatos NÃO importados", fora, fora > 0 ? "⚠ fora dos 8 pipelines do Squad" : "");
  }
  if (typeof noHub.deals === "number") {
    const fora = noHub.deals - deals;
    linha("negócios NÃO importados", fora, fora > 0 ? "⚠ de outros pipelines" : "");
  }

  // ── Pipelines: quais entram e quais não ──────────────────────────────────
  console.log("\n── Pipelines de negócio\n");
  const todos = await pipelines("deals");
  const dentro = todos.filter((p) => PIPELINES[p.id]);
  const fora = todos.filter((p) => !PIPELINES[p.id]);

  console.log(`  ${dentro.length} mapeados · ${fora.length} fora do escopo\n`);
  for (const p of dentro) {
    console.log(`    ✓ ${p.label.padEnd(30)} ${p.stages.length} etapas`);
  }
  for (const p of fora) {
    console.log(`    ✗ ${p.label.padEnd(30)} ${p.stages.length} etapas   (id ${p.id})`);
  }

  // ── Objetos que ninguém tocou ────────────────────────────────────────────
  console.log("\n── Objetos que a migração NUNCA leu\n");
  for (const [api, nome] of NAO_TOCADOS) {
    linha(nome, await quantos(api), `objeto "${api}"`);
  }

  // ── Propriedades customizadas ────────────────────────────────────────────
  console.log("\n── Propriedades customizadas (feitas pela operação)\n");
  for (const objeto of ["contacts", "deals"] as const) {
    const props = await propriedadesDe(objeto);
    const custom = props.filter((p) => p.hubspotDefined === false);
    linha(`${objeto}: customizadas`, custom.length, `de ${props.length} no total`);
  }

  console.log();
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("\n✗", e instanceof Error ? e.message : e, "\n");
  await prisma.$disconnect();
  process.exit(1);
});
