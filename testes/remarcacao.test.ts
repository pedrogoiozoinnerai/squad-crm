import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  alternativas,
  mensagemDoResultado,
  motivoParaNaoRemarcar,
} from "../src/lib/remarcacao";

/**
 * "Remarque aqui" apontava para uma página que não existia — 404.
 *
 * O desfecho era o pior dos dois mundos: a pessoa não aparecia E a vaga ficava
 * presa até a hora da sessão, bloqueando alguém que apareceria.
 */

const em = (iso: string) => new Date(iso);

describe("quem pode remarcar", () => {
  it("quem está inscrito", () => {
    assert.equal(motivoParaNaoRemarcar({ status: "INSCRITO", meetingId: "m1" }), null);
  });

  it("quem já confirmou também", () => {
    assert.equal(motivoParaNaoRemarcar({ status: "CONFIRMADO", meetingId: "m1" }), null);
  });

  it("convite cancelado, não — e a frase diz o que fazer", () => {
    const motivo = motivoParaNaoRemarcar({ status: "CANCELADO", meetingId: "m1" });
    assert.ok(motivo);
    assert.match(motivo, /cancelado/i);
    assert.match(motivo, /novo/i, "aponta um próximo passo");
  });
});

describe("as opções que a tela oferece", () => {
  const SESSOES = [
    { id: "b", inicioEm: em("2026-09-18T14:00:00Z"), vagas: 5 },
    { id: "a", inicioEm: em("2026-09-18T11:00:00Z"), vagas: 20 },
    { id: "cheia", inicioEm: em("2026-09-18T12:00:00Z"), vagas: 0 },
    { id: "atual", inicioEm: em("2026-09-18T13:00:00Z"), vagas: 3 },
  ];
  const inscricao = { status: "INSCRITO", meetingId: "atual" };

  it("a sessão atual sai da lista", () => {
    // Remarcar para o mesmo horário é um clique que não faz nada — e ainda
    // gastaria uma versão do convite de calendário.
    const ids = alternativas(SESSOES, inscricao).map((s) => s.id);
    assert.ok(!ids.includes("atual"));
  });

  it("sessão sem vaga sai da lista", () => {
    // Mostrar uma opção que vai falhar é pior que não mostrar.
    const ids = alternativas(SESSOES, inscricao).map((s) => s.id);
    assert.ok(!ids.includes("cheia"));
  });

  it("vêm em ordem de horário", () => {
    assert.deepEqual(alternativas(SESSOES, inscricao).map((s) => s.id), ["a", "b"]);
  });

  it("agenda vazia não quebra", () => {
    assert.deepEqual(alternativas([], inscricao), []);
  });

  it("só a própria sessão disponível devolve lista vazia", () => {
    const so = [{ id: "atual", inicioEm: em("2026-09-18T13:00:00Z"), vagas: 3 }];
    assert.deepEqual(alternativas(so, inscricao), []);
  });
});

describe("o que a tela diz", () => {
  it("sucesso", () => {
    assert.match(mensagemDoResultado({ tipo: "ok", meetingId: "x" }), /alterado/i);
  });

  it("lotada manda recarregar, e não trata como erro — é corrida normal", () => {
    const m = mensagemDoResultado({ tipo: "lotada" });
    assert.match(m, /encheu/i);
    assert.match(m, /atualizados/i);
  });

  it("indisponível manda escolher outra", () => {
    assert.match(mensagemDoResultado({ tipo: "indisponivel" }), /outra/i);
  });

  it("recusa repete o motivo, sem reescrever", () => {
    const motivo = "Este convite foi cancelado.";
    assert.equal(mensagemDoResultado({ tipo: "recusado", motivo }), motivo);
  });
});
