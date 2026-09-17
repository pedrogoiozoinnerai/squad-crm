import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  confirmar,
  juntar,
  lerEnvelope,
  LIMITE_DO_TEXTO,
  marcarNaoGravada,
  saneiaMensagem,
  type Mensagem,
} from "../src/lib/mensagens-da-sala";

/**
 * O chat perdia tudo.
 *
 * Fechar o painel desmontava a lista, recarregar zerava a conversa, e quem
 * entrava no meio da sessão via um chat vazio. A correção tem três fontes que
 * chegam fora de ordem — banco, canal de dados e a frase que acabou de ser
 * digitada — e é a costura entre elas que estes casos prendem.
 */

const em = (iso: string) => new Date(iso);

function msg(id: string, texto: string, iso: string, resto: Partial<Mensagem> = {}): Mensagem {
  return {
    id,
    identidade: "u_ana",
    autor: "Ana",
    texto,
    em: em(iso),
    minha: false,
    ...resto,
  };
}

describe("texto da mensagem", () => {
  it("corta pelas pontas", () => {
    assert.equal(saneiaMensagem("  oi  "), "oi");
  });

  it("só espaço não é mensagem", () => {
    assert.equal(saneiaMensagem("   \n\n  "), "");
  });

  it("colar um documento não empurra a conversa para fora da tela", () => {
    // Dez linhas em branco coladas junto com o trecho era o caso real.
    assert.equal(saneiaMensagem("um\n\n\n\n\n\ndois"), "um\n\ndois");
  });

  it("respeita o teto, e o teto é o mesmo dos dois lados", () => {
    assert.equal(saneiaMensagem("a".repeat(LIMITE_DO_TEXTO + 500)).length, LIMITE_DO_TEXTO);
  });
});

describe("juntar histórico com o que chega ao vivo", () => {
  it("a mesma mensagem pelos dois caminhos aparece uma vez só", () => {
    // A corrida real: peço o histórico e ao mesmo tempo começo a ouvir o canal.
    // Quem escreve nesse intervalo chega duas vezes.
    const aoVivo = [msg("abc", "oi", "2026-09-17T10:00:02.000Z")];
    const historico = [
      msg("ini", "antes", "2026-09-17T10:00:00.000Z"),
      msg("abc", "oi", "2026-09-17T10:00:02.000Z"),
    ];
    const juntas = juntar(aoVivo, historico);
    assert.equal(juntas.length, 2);
    assert.deepEqual(juntas.map((m) => m.texto), ["antes", "oi"]);
  });

  it("o histórico que chega atrasado entra ANTES do que já estava na tela", () => {
    const aoVivo = [msg("novo", "agora", "2026-09-17T10:05:00.000Z")];
    const historico = [msg("velho", "há uma hora", "2026-09-17T09:00:00.000Z")];
    assert.deepEqual(
      juntar(aoVivo, historico).map((m) => m.texto),
      ["há uma hora", "agora"],
    );
  });

  it("duas mensagens no mesmo milissegundo não trocam de lugar a cada render", () => {
    // Sem desempate estável, a lista se reordenava sozinha entre renders.
    const a = msg("aaa", "primeira", "2026-09-17T10:00:00.000Z");
    const b = msg("bbb", "segunda", "2026-09-17T10:00:00.000Z");
    assert.deepEqual(juntar([b, a], []).map((m) => m.id), ["aaa", "bbb"]);
    assert.deepEqual(juntar([a, b], []).map((m) => m.id), ["aaa", "bbb"]);
  });

  it("a versão mais nova de uma mensagem vence", () => {
    const antes = msg("x", "oi", "2026-09-17T10:00:00.000Z", { aCaminho: true });
    const depois = msg("x", "oi", "2026-09-17T10:00:00.000Z", { aCaminho: false });
    assert.equal(juntar([antes], [depois])[0].aCaminho, false);
  });
});

describe("a mensagem que acabou de ser digitada", () => {
  it("vira a gravada, mantendo o lugar na lista", () => {
    const lista = [
      msg("ini", "antes", "2026-09-17T10:00:00.000Z"),
      msg("local:1", "minha", "2026-09-17T10:00:01.000Z", { minha: true, aCaminho: true }),
    ];
    const depois = confirmar(lista, "local:1", { id: "banco-9", identidade: "c_ff00" });
    assert.equal(depois[1].id, "banco-9");
    assert.equal(depois[1].identidade, "c_ff00");
    assert.equal(depois[1].aCaminho, false);
    // O instante NÃO muda: senão a frase pula de lugar logo depois de aparecer.
    assert.equal(depois[1].em.toISOString(), "2026-09-17T10:00:01.000Z");
  });

  it("quando a gravação falha, a mensagem fica — marcada", () => {
    // Ela FOI entregue pelo canal de dados. Sumir com ela seria mentir para
    // quem escreveu, que viu os outros responderem.
    const lista = [msg("local:1", "minha", "2026-09-17T10:00:00.000Z", { aCaminho: true })];
    const depois = marcarNaoGravada(lista, "local:1");
    assert.equal(depois[0].naoGravada, true);
    assert.equal(depois[0].aCaminho, false);
    assert.equal(depois[0].texto, "minha");
  });
});

describe("envelope do canal de dados", () => {
  it("lê o que é nosso", () => {
    assert.deepEqual(lerEnvelope({ tipo: "chat", texto: " oi " }), { tipo: "chat", texto: "oi" });
  });

  it("ignora o que não é", () => {
    // O canal é compartilhado: um pacote interno do LiveKit lido como chat
    // viraria uma mensagem em branco no meio da conversa.
    assert.equal(lerEnvelope({ tipo: "presenca" }), null);
    assert.equal(lerEnvelope({ tipo: "chat", texto: 42 }), null);
    assert.equal(lerEnvelope({ tipo: "chat", texto: "   " }), null);
    assert.equal(lerEnvelope(null), null);
    assert.equal(lerEnvelope("chat"), null);
  });
});
