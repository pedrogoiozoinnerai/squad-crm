import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { diasEntre, prazoRelativo, rotuloDeDias } from "../src/lib/dates";

/**
 * O texto de prazo do cartão do pipeline.
 *
 * Ele tem que concordar com a contagem de atrasadas, que usa `dueAt < agora`.
 * A primeira versão contava em dias de calendário e escrevia "vence hoje" num
 * cartão que, logo acima, exibia a etiqueta "1 atrasada" — a tela se
 * contradizendo sozinha. Nenhum teste pegava isso porque nada aqui quebra:
 * só fica errado.
 */
describe("prazo relativo", () => {
  const agora = new Date("2026-09-15T14:00:00");

  it("trata hora já passada no mesmo dia como atraso", () => {
    const r = prazoRelativo(new Date("2026-09-15T09:00:00"), agora);
    assert.equal(r.atrasado, true);
    assert.equal(r.texto, "venceu hoje");
  });

  it("conta o atraso em dias de calendário", () => {
    const r = prazoRelativo(new Date("2026-09-14T23:00:00"), agora);
    assert.equal(r.atrasado, true);
    assert.equal(r.texto, "atrasada 1d");
  });

  it("hora futura no mesmo dia ainda não está atrasada", () => {
    const r = prazoRelativo(new Date("2026-09-15T18:00:00"), agora);
    assert.equal(r.atrasado, false);
    assert.equal(r.texto, "vence hoje");
  });

  it("amanhã é amanhã mesmo faltando poucas horas", () => {
    // 11 horas de distância, mas é o dia seguinte — é assim que se lê um prazo.
    const r = prazoRelativo(new Date("2026-09-16T01:00:00"), agora);
    assert.equal(r.texto, "vence amanhã");
  });

  it("prazo distante sai compacto", () => {
    assert.equal(prazoRelativo(new Date("2026-09-19T10:00:00"), agora).texto, "em 4d");
    assert.equal(prazoRelativo(new Date("2026-10-02T10:00:00"), agora).texto, "em 2 sem");
  });
});

describe("dias entre datas", () => {
  it("ignora a hora: conta viradas de dia", () => {
    assert.equal(diasEntre(new Date("2026-09-15T23:59:00"), new Date("2026-09-16T00:01:00")), 1);
    assert.equal(diasEntre(new Date("2026-09-15T00:01:00"), new Date("2026-09-15T23:59:00")), 0);
  });

  it("atravessa o horário de verão sem perder um dia", () => {
    // Fevereiro tem virada de fuso em vários anos de histórico importado.
    assert.equal(diasEntre(new Date("2026-02-14T12:00:00"), new Date("2026-02-21T12:00:00")), 7);
  });
});

describe("rótulo de duração", () => {
  it("muda de unidade sem ficar comprido", () => {
    assert.equal(rotuloDeDias(3), "3d");
    assert.equal(rotuloDeDias(-3), "3d");
    assert.equal(rotuloDeDias(14), "2 sem");
    assert.equal(rotuloDeDias(60), "2 m");
    assert.equal(rotuloDeDias(800), "2 a");
  });
});
