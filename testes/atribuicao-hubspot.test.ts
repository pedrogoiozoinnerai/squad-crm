import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  apenasOFaltante,
  lerAtribuicao,
  PROPS_ATRIBUICAO,
} from "../src/lib/atribuicao-hubspot";

/**
 * A migração trouxe 8.386 contatos com zero UTM.
 *
 * A causa: `PROPS_CONTATO` nunca pediu essas propriedades. E a armadilha do
 * conserto: as propriedades de nome ÓBVIO (`utm_source`, `utm_medium`…) existem
 * nesta conta e estão 100% vazias. Quem mapeia por nome, sem medir, traz cinco
 * colunas nulas e conclui que o HubSpot não tem atribuição.
 */

describe("de onde a UTM sai", () => {
  it("prefere a UTM de primeiro toque, que é a de verdade", () => {
    const a = lerAtribuicao({
      utm__first_source: "google",
      utm__first_medium: "cpc",
      utm__first_campaign: "21457397475",
      utm__first_content: "165039388775",
      hs_analytics_source: "PAID_SEARCH",
    });
    assert.equal(a.utmSource, "google");
    assert.equal(a.utmMedium, "cpc");
    assert.equal(a.utmCampaign, "21457397475");
    assert.equal(a.utmContent, "165039388775");
  });

  it("sem UTM, cai para a fonte nativa — e ela cobre 84% da base", () => {
    // `null` aqui faria a tela dizer "sem origem" para a maioria dos leads,
    // quando o HubSpot sabe perfeitamente de onde vieram.
    const a = lerAtribuicao({ hs_analytics_source: "OFFLINE" });
    assert.equal(a.utmSource, "offline");
  });

  it("a fonte nativa vem em minúsculas, para sentar ao lado de 'google'", () => {
    assert.equal(lerAtribuicao({ hs_analytics_source: "PAID_SEARCH" }).utmSource, "paid_search");
    assert.equal(
      lerAtribuicao({ hs_analytics_source: "ORGANIC_SEARCH" }).utmSource,
      "organic_search",
    );
  });

  it("as OUTRAS quatro ficam nulas sem UTM — não há equivalente nativo", () => {
    const a = lerAtribuicao({ hs_analytics_source: "OFFLINE", hs_analytics_source_data_1: "INTEGRATION" });
    assert.equal(a.utmMedium, null);
    assert.equal(a.utmCampaign, null);
    assert.equal(a.utmTerm, null);
    assert.equal(a.utmContent, null);
  });

  it("`source_data_1` NÃO vira campanha, por mais tentador que seja", () => {
    // Está 100% preenchido, mas o significado muda com o enum: em PAID_SEARCH é
    // a campanha, em OFFLINE é "INTEGRATION". Uma coluna "campanha" cheia de
    // INTEGRATION é pior que vazia, porque parece dado.
    const a = lerAtribuicao({ hs_analytics_source: "OFFLINE", hs_analytics_source_data_1: "INTEGRATION" });
    assert.notEqual(a.utmCampaign, "INTEGRATION");
  });
});

describe("valores sujos, que é o que vem de CRM de verdade", () => {
  it("espaço em branco não é valor", () => {
    const a = lerAtribuicao({ utm__first_source: "   ", hs_analytics_source: "OFFLINE" });
    assert.equal(a.utmSource, "offline", "caiu para a nativa em vez de gravar espaço");
  });

  it("apara as pontas", () => {
    assert.equal(lerAtribuicao({ utm__first_medium: "  cpc  " }).utmMedium, "cpc");
  });

  it('a string "null" não é uma origem — e apareceu na conta de verdade', () => {
    // Três contatos reais trazem a string "null" em `hs_analytics_source`,
    // rastro de uma integração que serializou o nulo em vez de omitir o campo.
    // Sem a peneira, a tela mostraria "null" como origem de tráfego.
    assert.equal(lerAtribuicao({ hs_analytics_source: "null" }).utmSource, null);
    assert.equal(lerAtribuicao({ utm__first_source: "undefined" }).utmSource, null);
    assert.equal(lerAtribuicao({ utm__first_medium: "N/A" }).utmMedium, null);
  });

  it('"null" na UTM cai para a fonte nativa, em vez de virar texto', () => {
    const a = lerAtribuicao({ utm__first_source: "null", hs_analytics_source: "PAID_SEARCH" });
    assert.equal(a.utmSource, "paid_search");
  });

  it("contato sem propriedade nenhuma não quebra", () => {
    const a = lerAtribuicao({});
    assert.equal(a.utmSource, null);
    assert.equal(a.utmMedium, null);
  });

  it("nulo e indefinido não quebram", () => {
    assert.equal(lerAtribuicao(null).utmSource, null);
    assert.equal(lerAtribuicao(undefined).utmCampaign, null);
  });

  it("número vira texto — campanha do Google Ads é um id numérico", () => {
    assert.equal(lerAtribuicao({ utm__first_campaign: 21457397475 }).utmCampaign, "21457397475");
  });
});

describe("reimportar não pode destruir", () => {
  it("preenche só o que falta", () => {
    const escrever = apenasOFaltante(
      { utmSource: "meta", utmMedium: null, utmCampaign: null, utmTerm: null, utmContent: null },
      { utmSource: "google", utmMedium: "cpc", utmCampaign: "123", utmTerm: null, utmContent: null },
    );
    // A UTM que já estava veio do funil, com a sessão real do lead. Vale mais
    // que o primeiro toque de um contato antigo do HubSpot.
    assert.equal(escrever.utmSource, undefined, "não sobrescreveu o que já existia");
    assert.equal(escrever.utmMedium, "cpc");
    assert.equal(escrever.utmCampaign, "123");
  });

  it("não devolve chave para o que continua nulo dos dois lados", () => {
    // No Prisma, `null` é "apague" e ausente é "não mexa". Devolver `null` aqui
    // transformaria um lead completo num lead zerado.
    const escrever = apenasOFaltante(
      { utmSource: "meta" },
      { utmSource: "google", utmMedium: null, utmCampaign: null, utmTerm: null, utmContent: null },
    );
    assert.deepEqual(escrever, {});
  });

  it("lead vazio recebe tudo", () => {
    const escrever = apenasOFaltante(
      {},
      { utmSource: "offline", utmMedium: null, utmCampaign: null, utmTerm: null, utmContent: null },
    );
    assert.deepEqual(escrever, { utmSource: "offline" });
  });

  it("espaço em branco no que já existe conta como vazio", () => {
    const escrever = apenasOFaltante(
      { utmSource: "  " },
      { utmSource: "google", utmMedium: null, utmCampaign: null, utmTerm: null, utmContent: null },
    );
    assert.equal(escrever.utmSource, "google");
  });
});

describe("o que a importação pede à API", () => {
  it("pede a família que TEM dado", () => {
    assert.ok(PROPS_ATRIBUICAO.includes("utm__first_source"));
    assert.ok(PROPS_ATRIBUICAO.includes("hs_analytics_source"));
  });

  it("NÃO pede a família de nome limpo, que está vazia nesta conta", () => {
    // Medido em 1.000 contatos: 0% de preenchimento. Pedir é gastar limite de
    // API para trazer `null`.
    assert.ok(!PROPS_ATRIBUICAO.includes("utm_source" as never));
    assert.ok(!PROPS_ATRIBUICAO.includes("utm_campaign" as never));
  });
});
