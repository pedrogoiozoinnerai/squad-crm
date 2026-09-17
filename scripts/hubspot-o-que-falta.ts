import "dotenv/config";

import { buscar, lote, propriedadesDe } from "./hubspot-client";
import { PIPELINES } from "./hubspot-mapa";

/**
 * Dentro dos 8 pipelines do Squad: o que tem dado e NÃO está sendo importado.
 *
 * A pergunta não é "quais propriedades existem" — são 996 em negócio e 525 em
 * contato, e a esmagadora maioria está vazia nesta operação. A pergunta é
 * quais estão PREENCHIDAS nos registros do Squad e ficaram de fora da
 * importação. Foi assim que a UTM apareceu: ela não estava escondida, estava
 * só não sendo pedida.
 *
 * Amostra, não censo: para separar "ninguém preenche" de "quase todo mundo",
 * algumas centenas bastam, e ler 10 mil negócios × 996 propriedades gastaria
 * meia hora de API para mudar uma casa decimal.
 *
 * Só lê.
 *
 *   npm run hubspot:falta
 */

/// Quantos registros por objeto.
const AMOSTRA = 400;

/// Quantas propriedades por chamada. O `batch/read` aceita um corpo grande,
/// mas pedir 996 de uma vez faz o HubSpot recusar por tamanho.
const POR_CHAMADA = 200;

/// O que a importação JÁ traz. Tem de espelhar `hubspot-importar.ts` — se as
/// duas listas divergirem, este relatório passa a mentir nos dois sentidos.
const JA_IMPORTADO = {
  deals: [
    "dealname",
    "amount",
    "dealstage",
    "pipeline",
    "hubspot_owner_id",
    "createdate",
    "closedate",
    "description",
    "closed_lost_reason",
  ],
  contacts: [
    "firstname",
    "lastname",
    "email",
    "phone",
    "mobilephone",
    "company",
    "jobtitle",
    "createdate",
    "utm__first_source",
    "utm__first_medium",
    "utm__first_campaign",
    "utm__first_content",
    "utm__first_keyword",
    "hs_analytics_source",
    "hs_analytics_source_data_1",
    "hs_analytics_source_data_2",
    "hs_analytics_first_url",
    "hs_analytics_first_referrer",
  ],
} as const;

/**
 * Ruído que não vale relatar.
 *
 * O HubSpot preenche dezenas de campos de controle interno — carimbos de
 * sincronização, contadores de objeto, flags de migração. Eles estão 100%
 * preenchidos e não significam nada para uma operação de vendas. Sem esta
 * peneira o relatório tem 300 linhas e ninguém lê nenhuma.
 */
const RUIDO = [
  /^hs_object_id$/,
  /^hs_lastmodifieddate$/,
  /^hs_createdate$/,
  /^hs_all_/,
  /^hs_merged/,
  /^hs_was_/,
  /^hs_is_/,
  /^hs_time_in_/,
  /^hs_date_entered_/,
  /^hs_date_exited_/,
  /^hs_v2_/,
  /^hs_latest_/,
  /^hs_pinned/,
  /^hs_read_only$/,
  /^hs_unique_creation_key$/,
  /^hs_updated_by_user_id$/,
  /^hs_created_by_user_id$/,
  /^hs_object_source/,
  /^hubspot_team_id$/,
  /^hs_user_ids_of_all/,
  /^hs_num_/,
  /^num_/,
];

const ehRuido = (nome: string) => RUIDO.some((r) => r.test(nome));

function vale(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  const s = String(v).trim();
  return s !== "" && s !== "0" && s.toLowerCase() !== "false";
}

async function amostrarDeals(): Promise<string[]> {
  const ids: string[] = [];
  const porPipeline = Math.ceil(AMOSTRA / Object.keys(PIPELINES).length);

  for (const pipelineId of Object.keys(PIPELINES)) {
    let n = 0;
    for await (const pagina of buscar(
      "deals",
      [{ propertyName: "pipeline", operator: "EQ", value: pipelineId }],
      ["dealname"],
    )) {
      for (const d of pagina) {
        if (n >= porPipeline) break;
        ids.push(d.id);
        n++;
      }
      if (n >= porPipeline) break;
    }
  }
  return ids;
}

async function medir(objeto: "deals" | "contacts", ids: string[], jaVem: readonly string[]) {
  const todas = (await propriedadesDe(objeto)).map((p) => p.name).filter((n) => !ehRuido(n));

  const cheias = new Map<string, number>();
  const exemplos = new Map<string, string>();

  for (let i = 0; i < todas.length; i += POR_CHAMADA) {
    const pedaco = todas.slice(i, i + POR_CHAMADA);
    const registros = await lote(objeto, ids, pedaco);
    for (const r of registros) {
      for (const nome of pedaco) {
        const v = r.properties?.[nome];
        if (vale(v)) {
          cheias.set(nome, (cheias.get(nome) ?? 0) + 1);
          if (!exemplos.has(nome)) exemplos.set(nome, String(v).slice(0, 30).replace(/\s+/g, " "));
        }
      }
    }
  }

  const faltando = [...cheias.entries()]
    .filter(([nome]) => !jaVem.includes(nome))
    .map(([nome, n]) => ({ nome, n, pct: Math.round((n / ids.length) * 100) }))
    .filter((p) => p.pct >= 5)
    .sort((a, b) => b.n - a.n);

  console.log(`\n── ${objeto}: ${ids.length} amostrados · ${faltando.length} propriedades com dado e SEM importar\n`);
  for (const p of faltando.slice(0, 40)) {
    console.log(`  ${p.nome.padEnd(44)} ${String(p.pct).padStart(3)}%   ${exemplos.get(p.nome) ?? ""}`);
  }
}

async function main() {
  console.log("\n═══ O QUE TEM DADO E NÃO ESTÁ VINDO ═══");

  const dealIds = await amostrarDeals();
  await medir("deals", dealIds, JA_IMPORTADO.deals);

  // Os contatos DESTES negócios, não contatos quaisquer do portal: a base do
  // Squad é uma fatia pequena e diferente do resto.
  const { associacoes } = await import("./hubspot-client");
  const assoc = await associacoes("deals", "contacts", dealIds);
  const contatoIds = [...new Set([...assoc.values()].flat())].slice(0, AMOSTRA);
  await medir("contacts", contatoIds, JA_IMPORTADO.contacts);

  console.log();
}

main().catch((e) => {
  console.error("\n✗", e instanceof Error ? e.message : e, "\n");
  process.exit(1);
});
