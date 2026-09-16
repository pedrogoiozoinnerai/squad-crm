import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { lerFalhaDaSala } from "../src/lib/falhas-da-sala";

/**
 * O que o lead lê quando a sala não abre.
 *
 * O caso que motivou isto apareceu num teste de verdade: quem clicava em
 * entrar via `could not establish pc connection` — mensagem interna do WebRTC,
 * em inglês, no fim de um funil pago.
 */
describe("falhas da sala", () => {
  it("traduz a falha de conexão e aponta a causa comum", () => {
    const f = lerFalhaDaSala(new Error("could not establish pc connection"));
    assert.match(f.titulo, /conex/i);
    assert.doesNotMatch(f.titulo, /pc connection/i, "nada de mensagem crua");
    assert.match(f.acao, /VPN|rede/i, "diz o que costuma ser");
    assert.equal(f.podeTentarDeNovo, true);
  });

  it("sala cheia não oferece tentar de novo", () => {
    // Tentar de novo numa sala cheia só repete a frustração.
    const f = lerFalhaDaSala(new Error("room is full"));
    assert.match(f.titulo, /cheia/i);
    assert.equal(f.podeTentarDeNovo, false);
  });

  it("token vencido manda recarregar", () => {
    const f = lerFalhaDaSala(new Error("invalid token"));
    assert.match(f.acao, /recarregue/i);
  });

  it("identidade duplicada explica a outra aba", () => {
    const f = lerFalhaDaSala(new Error("duplicate identity"));
    assert.match(f.titulo, /outra aba/i);
  });

  it("mensagem que JÁ veio em português passa direto", () => {
    // A rota do token responde em português e com precisão; reescrevê-la
    // trocaria "Esta reunião foi cancelada" por um genérico.
    //
    // Este caso pegou um defeito de verdade: a primeira versão olhava
    // nome+mensagem, e todo `Error` carrega o nome "Error" — então o português
    // vindo de um `new Error(...)` nunca era reconhecido.
    assert.equal(lerFalhaDaSala(new Error("A sala ainda não abriu."), "api").titulo, "A sala ainda não abriu.");
    assert.equal(lerFalhaDaSala("Esta reunião foi cancelada.", "api").titulo, "Esta reunião foi cancelada.");

    // E o contrário: vindo da conexão, um texto qualquer NÃO passa cru.
    assert.notEqual(lerFalhaDaSala(new Error("coisa que ninguém previu")).titulo, "coisa que ninguém previu");
  });

  it("erro desconhecido nunca vaza texto de biblioteca", () => {
    for (const bicho of [
      new Error("ENOTFOUND xyz"),
      new Error(""),
      null,
      undefined,
      { qualquer: "coisa" },
      12345,
    ]) {
      const f = lerFalhaDaSala(bicho);
      assert.ok(f.titulo.length > 0, "sempre tem título");
      assert.doesNotMatch(f.titulo, /ENOTFOUND|undefined|\[object/i);
    }
  });

  it("toda falha do catálogo termina numa ação ou numa frase completa", () => {
    for (const bruto of [
      "could not establish pc connection",
      "room is full",
      "invalid token",
      "websocket failed",
      "client initiated disconnect",
      "duplicate identity",
      "coisa que ninguém previu",
    ]) {
      const f = lerFalhaDaSala(new Error(bruto), "conexao");
      assert.ok(f.titulo.endsWith(".") || f.acao.length > 0, `${bruto}: sem desfecho`);
    }
  });
});
