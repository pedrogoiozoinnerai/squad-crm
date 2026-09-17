import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import { env, envObrigatorio, identificador } from "../src/lib/env";
import { buscar } from "./hubspot-client";
import { PIPELINES } from "./hubspot-mapa";

/**
 * A migração está completa DENTRO do escopo declarado?
 *
 * "Puxar tudo" tem duas leituras, e elas levam a lugares muito diferentes:
 *
 * 1. **Tudo do Squad** — os 8 pipelines que a operação usa. É o escopo que foi
 *    decidido, e a pergunta aqui é se ele veio inteiro ou se ficou buraco.
 * 2. **Tudo do portal** — 738 mil contatos e 218 mil negócios de 26 pipelines,
 *    a maioria de outras operações da empresa.
 *
 * Este script responde a primeira, negócio por negócio: conta o que existe em
 * cada pipeline do Squad no HubSpot e confere contra o que está no CRM.
 *
 * Só lê.
 *
 *   npm run hubspot:completude
 */

const SCHEMA = identificador("DB_SCHEMA", env("DB_SCHEMA", "crm")!);
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: envObrigatorio("DIRECT_URL") }, { schema: SCHEMA }),
});

async function main() {
  console.log(`\n═══ COMPLETUDE DO ESCOPO SQUAD (${SCHEMA}) ═══\n`);
  console.log("  pipeline                        HubSpot      CRM    falta\n");

  let totalHub = 0;
  let totalCrm = 0;
  const faltando: { nome: string; ids: string[] }[] = [];

  for (const [pipelineId, meta] of Object.entries(PIPELINES)) {
    const idsNoHub: string[] = [];
    for await (const pagina of buscar(
      "deals",
      [{ propertyName: "pipeline", operator: "EQ", value: pipelineId }],
      ["dealname"],
    )) {
      for (const d of pagina) idsNoHub.push(d.id);
    }

    const noCrm = await prisma.deal.findMany({
      where: { hubspotDealId: { in: idsNoHub } },
      select: { hubspotDealId: true },
    });
    const presentes = new Set(noCrm.map((d) => d.hubspotDealId));
    const ausentes = idsNoHub.filter((id) => !presentes.has(id));

    totalHub += idsNoHub.length;
    totalCrm += presentes.size;
    if (ausentes.length) faltando.push({ nome: meta.nome, ids: ausentes });

    const marca = ausentes.length === 0 ? "✓" : "✗";
    console.log(
      `  ${marca} ${meta.nome.padEnd(28)} ${String(idsNoHub.length).padStart(6)}` +
        `   ${String(presentes.size).padStart(6)}   ${String(ausentes.length).padStart(6)}`,
    );
  }

  console.log(`\n  ${"TOTAL".padEnd(30)} ${String(totalHub).padStart(6)}   ${String(totalCrm).padStart(6)}   ${String(totalHub - totalCrm).padStart(6)}`);

  if (faltando.length) {
    console.log("\n── Negócios que ficaram para trás\n");
    for (const f of faltando) {
      console.log(`  ${f.nome}: ${f.ids.length}`);
      console.log(`    ${f.ids.slice(0, 6).join(", ")}${f.ids.length > 6 ? " …" : ""}`);
    }
    console.log("\n  `npm run hubspot:importar -- --aplicar` traz estes — é upsert, não duplica.\n");
  } else {
    console.log("\n  ✓ Nenhum negócio do Squad ficou para trás.\n");
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("\n✗", e instanceof Error ? e.message : e, "\n");
  await prisma.$disconnect();
  process.exit(1);
});
