import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  apenasOFaltante,
  fonteNativaDoHubspot,
  lerAtribuicao,
  PROPS_ATRIBUICAO,
} from "../src/lib/atribuicao-hubspot";

/**
 * A migração trouxe 8.386 contatos com zero UTM, porque `PROPS_CONTATO` nunca
 * pediu essas propriedades.
 *
 * E o conserto errou uma vez antes de acertar. Esta conta tem DUAS famílias de
 * UTM, e qual delas está preenchida depende de quem se mede: no portal inteiro
 * é `utm__first_*`; na base do Squad é a de nome limpo, com campanha de verdade.
 * A primeira medição foi na população errada — mil contatos do portal, nenhum
 * deles entre os importados — e produziu uma conclusão confiante e invertida.
 *
 * Por isso os casos abaixo cobrem as duas famílias: a leitura tem de continuar
 * certa mesmo que a proporção mude.
 */

describe("as duas famílias de UTM", () => {
  it("a de nome limpo vem na frente — é a da base do Squad", () => {
    const a = lerAtribuicao({
      utm_source: "meta",
      utm_medium: "ads",
      utm_campaign: "LEADS_SQUAD-DIAGNOSTICO-3",
      utm_term: "LEADS_SQUAD-DIAGNOSTICO-3-IMG-01",
      utm_content: "LEADS_SQUAD-DIAGNOSTICO-3-IMG-01",
      utm__first_source: "mobile",
    });
    assert.equal(a.utmSource, "meta");
    assert.equal(a.utmMedium, "ads");
    assert.equal(a.utmCampaign, "LEADS_SQUAD-DIAGNOSTICO-3");
    assert.equal(a.utmTerm, "LEADS_SQUAD-DIAGNOSTICO-3-IMG-01");
    assert.equal(a.utmContent, "LEADS_SQUAD-DIAGNOSTICO-3-IMG-01");
  });

  it("a de primeiro toque entra quando a outra falta", () => {
    // É a família da outra operação do portal. Aceitar as duas é o que faz a
    // leitura sobreviver a uma mudança de proporção entre as bases.
    const a = lerAtribuicao({
      utm__first_source: "google",
      utm__first_medium: "cpc",
      utm__first_campaign: "21457397475",
    });
    assert.equal(a.utmSource, "google");
    assert.equal(a.utmMedium, "cpc");
    assert.equal(a.utmCampaign, "21457397475");
  });

  it("mistura das duas: cada coluna escolhe sozinha", () => {
    const a = lerAtribuicao({ utm_source: "meta", utm__first_medium: "cpc" });
    assert.equal(a.utmSource, "meta");
    assert.equal(a.utmMedium, "cpc");
  });

  it("a importação pede AS DUAS à API", () => {
    // Foi escolher uma família sozinha que produziu uma coluna cheia de
    // "offline" onde havia "meta".
    for (const p of ["utm_source", "utm_campaign", "utm__first_source"]) {
      assert.ok(PROPS_ATRIBUICAO.includes(p as never), `faltou pedir ${p}`);
    }
  });
});

describe("a fonte nativa NÃO entra em utmSource", () => {
  it("contato sem UTM nenhuma fica sem origem — e isso é a verdade", () => {
    // Usar `hs_analytics_source` como reserva misturava dois vocabulários e,
    // pior, o "offline" gravado passava a BLOQUEAR o "meta" verdadeiro, porque
    // o preenchimento não sobrescreve o que já existe.
    const a = lerAtribuicao({ hs_analytics_source: "OFFLINE" });
    assert.equal(a.utmSource, null);
  });

  it("mas continua legível para quem quiser a informação noutro lugar", () => {
    assert.equal(fonteNativaDoHubspot("PAID_SEARCH"), "paid_search");
    assert.equal(fonteNativaDoHubspot(""), null);
  });

  it("`source_data_1` não vira campanha, por mais tentador que seja", () => {
    // 100% preenchido, mas o significado muda com o enum: em PAID_SEARCH é a
    // campanha, em OFFLINE é IMPORT. Coluna "campanha" cheia de IMPORT é pior
    // que vazia, porque parece dado.
    const a = lerAtribuicao({ hs_analytics_source: "OFFLINE", hs_analytics_source_data_1: "IMPORT" });
    assert.equal(a.utmCampaign, null);
  });
});

describe("valores sujos, que é o que vem de CRM de verdade", () => {
  it("espaço em branco não é valor, e deixa a outra família assumir", () => {
    const a = lerAtribuicao({ utm_source: "   ", utm__first_source: "google" });
    assert.equal(a.utmSource, "google");
  });

  it("apara as pontas", () => {
    assert.equal(lerAtribuicao({ utm_medium: "  ads  " }).utmMedium, "ads");
  });

  it('a string "null" não é uma origem — e apareceu na conta de verdade', () => {
    assert.equal(lerAtribuicao({ utm_source: "null" }).utmSource, null);
    assert.equal(lerAtribuicao({ utm_source: "undefined" }).utmSource, null);
    assert.equal(lerAtribuicao({ utm_medium: "N/A" }).utmMedium, null);
  });

  it('"null" na primeira família cai para a segunda', () => {
    const a = lerAtribuicao({ utm_source: "null", utm__first_source: "google" });
    assert.equal(a.utmSource, "google");
  });

  it("contato sem propriedade nenhuma não quebra", () => {
    assert.equal(lerAtribuicao({}).utmSource, null);
    assert.equal(lerAtribuicao(null).utmSource, null);
    assert.equal(lerAtribuicao(undefined).utmCampaign, null);
  });

  it("número vira texto — campanha do Google Ads é um id numérico", () => {
    assert.equal(lerAtribuicao({ utm_campaign: 21457397475 }).utmCampaign, "21457397475");
  });
});

describe("reimportar não pode destruir", () => {
  it("preenche só o que falta", () => {
    const escrever = apenasOFaltante(
      { utmSource: "meta", utmMedium: null, utmCampaign: null, utmTerm: null, utmContent: null },
      { utmSource: "google", utmMedium: "cpc", utmCampaign: "123", utmTerm: null, utmContent: null },
    );
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
      { utmSource: "meta", utmMedium: "ads", utmCampaign: null, utmTerm: null, utmContent: null },
    );
    assert.deepEqual(escrever, { utmSource: "meta", utmMedium: "ads" });
  });

  it("espaço em branco no que já existe conta como vazio", () => {
    const escrever = apenasOFaltante(
      { utmSource: "  " },
      { utmSource: "meta", utmMedium: null, utmCampaign: null, utmTerm: null, utmContent: null },
    );
    assert.equal(escrever.utmSource, "meta");
  });
});
