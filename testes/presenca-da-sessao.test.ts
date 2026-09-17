import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ehQualificado,
  situacaoDaSessao,
  taxaDaSessao,
  totaisDoPeriodo,
} from "../src/lib/presenca";

/**
 * A taxa de presença estava calculada em três lugares.
 *
 * `queries.ts`, `SessionsView` e `SessionDrawer` tinham cópias — e as cópias já
 * tinham divergido: a tela da semana divide os presentes pelos inscritos das
 * sessões REALIZADAS, a consulta e o drawer dividem pelos inscritos DAQUELA
 * sessão. Duas métricas diferentes com o mesmo nome na mesma tela.
 *
 * Aqui elas continuam diferentes, mas cada uma diz qual é.
 */

const em = (iso: string) => new Date(iso);
const AGORA = em("2026-09-17T15:00:00Z");

const sessao = (
  status: string,
  inicio: string,
  fim: string,
  inscritos = 0,
  presentes = 0,
  qualificados = 0,
) => ({ status, startsAt: em(inicio), endsAt: em(fim), inscritos, presentes, qualificados });

describe("a taxa de uma sessão", () => {
  it("é presentes sobre inscritos, arredondada", () => {
    assert.equal(taxaDaSessao(20, 13), 65);
    assert.equal(taxaDaSessao(3, 1), 33);
  });

  it("sem inscrito nenhum é zero, não divisão por zero", () => {
    assert.equal(taxaDaSessao(0, 0), 0);
  });

  it("todo mundo veio é 100", () => {
    assert.equal(taxaDaSessao(20, 20), 100);
  });
});

describe("lead que vale a ligação", () => {
  it("A e B", () => {
    assert.equal(ehQualificado("A"), true);
    assert.equal(ehQualificado("B"), true);
  });

  it("o resto não", () => {
    for (const s of ["C", "D", "E", "", null, undefined]) {
      assert.equal(ehQualificado(s), false, `${s} não devia qualificar`);
    }
  });
});

describe("em que ponto da vida a sessão está", () => {
  it("cancelada vence tudo, inclusive o horário", () => {
    const c = sessao("CANCELED", "2026-09-17T10:00:00Z", "2026-09-17T11:00:00Z");
    assert.equal(situacaoDaSessao(c, AGORA), "cancelada");
  });

  it("ainda não começou", () => {
    const f = sessao("SCHEDULED", "2026-09-17T18:00:00Z", "2026-09-17T19:00:00Z");
    assert.equal(situacaoDaSessao(f, AGORA), "futura");
  });

  it("acontecendo agora", () => {
    const a = sessao("SCHEDULED", "2026-09-17T14:30:00Z", "2026-09-17T15:30:00Z");
    assert.equal(situacaoDaSessao(a, AGORA), "emAndamento");
  });

  it("terminou: agora o número significa alguma coisa", () => {
    const m = sessao("SCHEDULED", "2026-09-17T13:00:00Z", "2026-09-17T14:00:00Z");
    assert.equal(situacaoDaSessao(m, AGORA), "medida");
  });

  it("o instante exato do fim ainda é 'em andamento'", () => {
    // Quem está na sala no segundo do fim não virou histórico ainda.
    const borda = sessao("SCHEDULED", "2026-09-17T14:00:00Z", "2026-09-17T15:00:00Z");
    assert.equal(situacaoDaSessao(borda, em("2026-09-17T14:59:59Z")), "emAndamento");
    assert.equal(situacaoDaSessao(borda, em("2026-09-17T15:00:01Z")), "medida");
  });
});

describe("os totais do período", () => {
  const SEMANA = [
    sessao("SCHEDULED", "2026-09-15T10:00:00Z", "2026-09-15T11:00:00Z", 20, 12, 5),
    sessao("SCHEDULED", "2026-09-16T10:00:00Z", "2026-09-16T11:00:00Z", 10, 8, 3),
    // Ainda vai acontecer: 20 inscritos e 0 presentes.
    sessao("SCHEDULED", "2026-09-18T10:00:00Z", "2026-09-18T11:00:00Z", 20, 0, 0),
    sessao("CANCELED", "2026-09-16T14:00:00Z", "2026-09-16T15:00:00Z", 15, 0, 0),
  ];

  it("só as que terminaram entram na conta", () => {
    // É a regra que mais importa: sem ela, as 20 vagas de amanhã entrariam como
    // 20 ausências e a taxa da semana despencaria por uma call que nem
    // aconteceu.
    const t = totaisDoPeriodo(SEMANA, AGORA);
    assert.equal(t.realizadas, 2);
    assert.equal(t.inscritosRealizados, 30);
    assert.equal(t.presentes, 20);
    assert.equal(t.taxa, 67);
  });

  it("cancelada não conta nem como inscrito nem como ausente", () => {
    const t = totaisDoPeriodo(SEMANA, AGORA);
    assert.ok(t.inscritosRealizados < 45, "os 15 da cancelada não entraram");
  });

  it("é presentes sobre inscritos, NÃO a média das taxas", () => {
    // Uma sessão de 1 inscrito pesaria igual a uma de 20 na média simples.
    const desbalanceada = [
      sessao("SCHEDULED", "2026-09-15T10:00:00Z", "2026-09-15T11:00:00Z", 20, 2, 0),
      sessao("SCHEDULED", "2026-09-16T10:00:00Z", "2026-09-16T11:00:00Z", 1, 1, 0),
    ];
    const t = totaisDoPeriodo(desbalanceada, AGORA);
    assert.equal(t.taxa, 14, "3 de 21, e não a média de 10% com 100%");
  });

  it("semana sem nada realizado não quebra", () => {
    const t = totaisDoPeriodo([SEMANA[2]], AGORA);
    assert.equal(t.realizadas, 0);
    assert.equal(t.taxa, 0);
  });

  it("lista vazia não quebra", () => {
    assert.deepEqual(totaisDoPeriodo([], AGORA), {
      realizadas: 0,
      inscritosRealizados: 0,
      presentes: 0,
      qualificados: 0,
      taxa: 0,
    });
  });

  it("soma os qualificados só das realizadas", () => {
    assert.equal(totaisDoPeriodo(SEMANA, AGORA).qualificados, 8);
  });
});
