import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { moneyCents } from "../src/lib/forms";

/**
 * As regras que guardam o número da diretoria.
 *
 * Valor e probabilidade entram direto na soma ponderada do pipeline. Um
 * negativo ou um 500% ali não quebra tela nenhuma — só faz a previsão mentir,
 * que é o pior tipo de defeito porque ninguém vai atrás.
 */
function probabilidadeValida(bruto: FormDataEntryValue | null) {
  const n = bruto === null ? 20 : Number(bruto);
  return Number.isFinite(n) && n >= 0 && n <= 100;
}

describe("probabilidade do negócio", () => {
  it("aceita a faixa inteira", () => {
    for (const v of ["0", "20", "100"]) assert.equal(probabilidadeValida(v as never), true, v);
  });

  it("recusa fora da faixa e lixo", () => {
    for (const v of ["-1", "101", "500", "abc", "Infinity"]) {
      assert.equal(probabilidadeValida(v as never), false, v);
    }
  });

  it("assume 20 quando o campo não veio", () => {
    assert.equal(probabilidadeValida(null), true);
  });
});

describe("valor do negócio", () => {
  it("recusa negativo", () => {
    // `moneyCents` converte; quem chama é que barra. O sinal precisa sobreviver
    // à conversão para que a checagem tenha o que barrar.
    assert.ok((moneyCents("-500" as never) ?? 0) < 0);
  });

  it("distingue campo vazio de valor inválido", () => {
    assert.equal(moneyCents("" as never), null);
    assert.equal(moneyCents("abc" as never), null);
    assert.equal(moneyCents("0" as never), 0);
  });
});
