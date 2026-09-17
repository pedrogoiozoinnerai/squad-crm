import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import { apenasOFaltante, lerAtribuicao, PROPS_ATRIBUICAO } from "../src/lib/atribuicao-hubspot";
import { env, envObrigatorio, identificador } from "../src/lib/env";
import { lote } from "./hubspot-client";

/**
 * Preenche a atribuição dos leads que já vieram do HubSpot.
 *
 * A migração trouxe 8.386 contatos sem uma única UTM, porque `PROPS_CONTATO`
 * nunca pediu essas propriedades à API. O importador já foi corrigido; isto
 * aqui é o passado.
 *
 * **Escreve só as cinco colunas de `utm*`, e só onde estão vazias.** Reimportar
 * tudo resolveria também, mas tocaria negócios, etapas, notas e tarefas para
 * consertar cinco campos — muito estrago possível para o tamanho do conserto. E
 * não sobrescreve: se a UTM já existe, ela veio de um caminho que sabe mais (o
 * funil grava a sessão real do lead), e o primeiro toque de um contato antigo
 * não tem por que vencer.
 *
 *   npm run hubspot:utm                  simula, não escreve nada
 *   npm run hubspot:utm -- --aplicar     grava
 */

const APLICAR = process.argv.includes("--aplicar");

/// Quantos contatos por chamada. O `batch/read` do HubSpot aceita 100.
const POR_LOTE = 100;

const schema = identificador("DB_SCHEMA", env("DB_SCHEMA", "crm")!);
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: envObrigatorio("DIRECT_URL") }, { schema }),
});

async function main() {
  console.log(`\nAtribuição retroativa · schema ${schema}${APLICAR ? "" : "  (simulação)"}\n`);

  const leads = await prisma.lead.findMany({
    where: { hubspotContactId: { not: null } },
    select: {
      id: true,
      hubspotContactId: true,
      utmSource: true,
      utmMedium: true,
      utmCampaign: true,
      utmTerm: true,
      utmContent: true,
    },
  });
  console.log(`  ${leads.length} leads vindos do HubSpot`);

  const porContato = new Map(leads.map((l) => [l.hubspotContactId!, l]));
  const ids = [...porContato.keys()];

  let lidos = 0;
  let atualizados = 0;
  let semNada = 0;
  const fontes = new Map<string, number>();

  for (let i = 0; i < ids.length; i += POR_LOTE) {
    const pedaco = ids.slice(i, i + POR_LOTE);
    // `lote` engole o contato que não existe mais no HubSpot, o que é o certo:
    // contato apagado lá não deve derrubar o preenchimento dos outros 8 mil.
    const contatos = await lote("contacts", pedaco, [...PROPS_ATRIBUICAO]);

    for (const c of contatos) {
      lidos++;
      const lead = porContato.get(c.id);
      if (!lead) continue;

      const doHubspot = lerAtribuicao(c.properties);
      const escrever = apenasOFaltante(lead, doHubspot);

      if (Object.keys(escrever).length === 0) {
        semNada++;
        continue;
      }

      if (escrever.utmSource) {
        fontes.set(escrever.utmSource, (fontes.get(escrever.utmSource) ?? 0) + 1);
      }

      if (APLICAR) {
        await prisma.lead.update({ where: { id: lead.id }, data: escrever });
      }
      atualizados++;
    }

    if (i % (POR_LOTE * 10) === 0) {
      process.stdout.write(`\r  lidos ${lidos}/${ids.length}…`);
    }
  }

  console.log(`\r  lidos ${lidos}/${ids.length}          `);
  console.log(`\n  ${atualizados} leads ${APLICAR ? "atualizados" : "a atualizar"}`);
  console.log(`  ${semNada} já estavam completos ou não têm o que preencher\n`);

  console.log("  origens que entram:");
  for (const [fonte, n] of [...fontes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
    console.log(`    ${fonte.padEnd(24)} ${String(n).padStart(6)}`);
  }

  if (!APLICAR) console.log("\n  (nada foi escrito — acrescente --aplicar)\n");
  else console.log();

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("\n✗", e instanceof Error ? e.message : e, "\n");
  await prisma.$disconnect();
  process.exit(1);
});
