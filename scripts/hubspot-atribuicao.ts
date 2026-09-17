import "dotenv/config";

import { listar, propriedadesDe } from "./hubspot-client";

/**
 * Onde a ATRIBUIÇÃO mora nesta conta do HubSpot — e quanto dela está preenchida.
 *
 * A importação trouxe 8.386 contatos sem uma única UTM. O motivo é simples e
 * está no código: `PROPS_CONTATO` nunca pediu essas propriedades. Mas antes de
 * sair acrescentando nomes é preciso saber QUAIS existem nesta conta e QUAIS
 * têm dado — HubSpot tem dois mundos de atribuição que se parecem e não são a
 * mesma coisa:
 *
 * - **`hs_analytics_source*`** são as propriedades NATIVAS, preenchidas pelo
 *   rastreamento do próprio HubSpot. `source` é um enum (PAID_SEARCH,
 *   ORGANIC_SEARCH…), e `source_data_1` / `source_data_2` guardam campanha e
 *   termo, com significado que MUDA conforme o enum.
 * - **`utm_source`, `utm_campaign`…** são propriedades CUSTOMIZADAS que cada
 *   operação cria à mão. Podem não existir, podem ter outro nome, podem existir
 *   e estar vazias porque ninguém ligou o formulário nelas.
 *
 * Só lê e imprime. Não escreve nada, nem no HubSpot nem no CRM.
 *
 *   npm run hubspot:atribuicao
 */

/// O que procurar. Nome exato e também por pedaço, porque cada conta batiza
/// as customizadas do seu jeito (`utm_source__c`, `utm_source_first`…).
const PEDACOS = ["utm", "analytics_source", "analytics_first", "analytics_last", "gclid", "fbclid", "referrer", "campaign", "medium"];

/// Quantos registros amostrar por objeto.
///
/// Mil: o suficiente para separar "ninguém preencheu" de "quase todo mundo",
/// que é a única pergunta que decide o mapeamento. Ler os 8 mil para responder
/// isso seria gastar dez minutos de API por uma resposta que já está clara na
/// primeira página.
const AMOSTRA = 1000;

async function main() {
  console.log("\n═══ ATRIBUIÇÃO NO HUBSPOT ═══");

  for (const objeto of ["contacts", "deals"] as const) {
    const todas = await propriedadesDe(objeto);
    const achadas = todas
      .filter((p) => PEDACOS.some((pedaco) => p.name.toLowerCase().includes(pedaco)))
      .map((p) => p.name);

    if (!achadas.length) {
      console.log(`\n── ${objeto}: nenhuma propriedade de atribuição\n`);
      continue;
    }

    // Quantos têm CADA propriedade preenchida. Propriedade existir não quer
    // dizer nada: a conta pode ter criado `utm_source` e nunca ter ligado o
    // formulário nela, e mapear uma coluna sempre vazia dá trabalho e não traz
    // informação nenhuma.
    const cheios = new Map<string, number>(achadas.map((n) => [n, 0]));
    const exemplos = new Map<string, string>();
    let lidos = 0;

    for await (const pagina of listar(objeto, achadas)) {
      for (const reg of pagina) {
        lidos++;
        for (const nome of achadas) {
          const v = reg.properties?.[nome];
          if (v !== null && v !== undefined && String(v).trim() !== "") {
            cheios.set(nome, (cheios.get(nome) ?? 0) + 1);
            if (!exemplos.has(nome)) exemplos.set(nome, String(v).slice(0, 34));
          }
        }
      }
      if (lidos >= AMOSTRA) break;
    }

    console.log(`\n── ${objeto} · amostra de ${lidos}\n`);
    const ordenadas = achadas
      .map((n) => ({ nome: n, n: cheios.get(n) ?? 0 }))
      .sort((a, b) => b.n - a.n);
    for (const { nome, n } of ordenadas) {
      const pct = lidos ? Math.round((n / lidos) * 100) : 0;
      const barra = n === 0 ? "— vazia" : `${String(pct).padStart(3)}%  ex.: ${exemplos.get(nome) ?? ""}`;
      console.log(`  ${nome.padEnd(44)} ${String(n).padStart(5)}  ${barra}`);
    }
  }
  console.log();
}

main().catch((e) => {
  console.error("\n✗", e instanceof Error ? e.message : e, "\n");
  process.exit(1);
});
