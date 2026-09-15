import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ETAPAS, PIPELINES, destinoDe } from "../scripts/hubspot-mapa";
import { classificarMotivo } from "../scripts/hubspot-motivos";
import { nomeLimpo, texto } from "../scripts/hubspot-texto";
import { moneyCents } from "../src/lib/forms";

describe("dinheiro em centavos", () => {
  it("converte o formato brasileiro", () => {
    assert.equal(moneyCents("1.234,56" as never), 123456);
    assert.equal(moneyCents("60000" as never), 6000000);
    assert.equal(moneyCents("0,01" as never), 1);
  });

  it("arredonda em vez de truncar", () => {
    // Float em dinheiro acumula erro; o arredondamento tem de ser explícito.
    assert.equal(moneyCents("0,005" as never), 1);
    assert.equal(moneyCents("10,999" as never), 1100);
  });

  it("devolve nulo para o que não é número", () => {
    // `Number("")` é 0 e finito: sem tratar, "abc" virava R$ 0,00 salvo em
    // silêncio. Quem chama distingue vazio (zerar) de inválido (erro).
    assert.equal(moneyCents("" as never), null);
    assert.equal(moneyCents("abc" as never), null);
    assert.equal(moneyCents("R$" as never), null);
    assert.equal(moneyCents(null), null);
  });

  it("aceita o cifrão e o espaço que o teclado põe", () => {
    assert.equal(moneyCents("R$ 12.500,00" as never), 1250000);
  });
});

describe("de-para das etapas do HubSpot", () => {
  it("cobre todas as etapas dos oito pipelines do Squad", () => {
    assert.equal(Object.keys(PIPELINES).length, 8);
    assert.ok(Object.keys(ETAPAS).length >= 69, "esperava ao menos 69 etapas mapeadas");
  });

  it("derruba a importação em etapa desconhecida", () => {
    // Uma etapa criada no HubSpot depois do levantamento entraria como "novo"
    // se o padrão fosse silencioso, e ninguém veria o erro.
    assert.throws(() => destinoDe("999999999", "930609554"), /Etapa desconhecida/);
  });

  it("manda pipeline de pós-venda para ganho, não para o funil de venda", () => {
    // "Calibrando Waz" é cliente em onboarding, não oportunidade aberta.
    assert.deepEqual(destinoDe("1400063753", "917642543")[1], { tipo: "ganho" });
  });

  it("trata cobrança como aberta até o pagamento entrar", () => {
    assert.deepEqual(destinoDe("1413155993", "923695777")[1], { tipo: "etapa", etapa: "fechamento" });
    assert.deepEqual(destinoDe("1413155997", "923695777")[1], { tipo: "ganho" });
  });

  it("devolve o rótulo original junto, para virar anotação", () => {
    assert.equal(destinoDe("1427866941", "930609554")[0], "Ganho");
  });
});

describe("motivo de perda", () => {
  it("agrupa as variações escritas à mão", () => {
    for (const v of ["Sem retorno", "ghost", "Cliente parou de responder", "Nao retornou mais, nem atende telefone"]) {
      assert.equal(classificarMotivo(v), "Não respondeu", v);
    }
  });

  it("não inventa motivo para texto sem sentido", () => {
    // Melhor um buraco honesto do que um motivo inventado que vira decisão.
    assert.equal(classificarMotivo("lead kris"), null);
    assert.equal(classificarMotivo("-"), null);
    assert.equal(classificarMotivo(""), null);
    assert.equal(classificarMotivo(null), null);
  });
});

describe("limpeza de texto do HubSpot", () => {
  it("converte o HTML do editor em texto", () => {
    assert.equal(texto("<div>Oi<br>tudo bem?</div>"), "Oi\ntudo bem?");
    assert.equal(texto("a &amp; b &lt;c&gt;"), "a & b <c>");
    assert.equal(texto(null), "");
  });

  it("tira o sobrenome que é só pontuação", () => {
    assert.equal(nomeLimpo("Juciele ."), "Juciele");
    assert.equal(nomeLimpo("- João -"), "João");
    assert.equal(nomeLimpo("Ana Luiza Rosa"), "Ana Luiza Rosa");
  });
});
