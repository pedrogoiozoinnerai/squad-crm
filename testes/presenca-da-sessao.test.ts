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

// ── A página de UMA sessão ───────────────────────────────────────────────────

import { minutoDaCall, naSalaEm, ordemDoRoster, saidaDoParticipante } from "../src/lib/presenca";

const INICIO = em("2026-09-17T14:00:00Z");
const FIM = em("2026-09-17T15:00:00Z");

describe("quando a pessoa saiu", () => {
  it("quem saiu no encerramento ficou até o fim", () => {
    const s = saidaDoParticipante({ joinedAt: INICIO, leftAt: em("2026-09-17T14:58:00Z") }, INICIO, FIM);
    assert.deepEqual(s, { tipo: "ficou_ate_o_fim" });
  });

  it("saiu aos 12 min é um lead DIFERENTE de quem ficou até o fim", () => {
    // Os dois têm o mesmo chip de "Presente" hoje. Um viu a oferta, o outro
    // saiu antes do diagnóstico — e o closer liga para os dois igual.
    const s = saidaDoParticipante({ joinedAt: INICIO, leftAt: em("2026-09-17T14:12:00Z") }, INICIO, FIM);
    assert.deepEqual(s, { tipo: "saiu_antes", minuto: 12 });
  });

  it("a folga do fim é generosa de propósito", () => {
    // A sala é fechada minutos depois de esvaziar, e quem sai no encerramento
    // sai segundos antes de quem apaga a luz. Sem folga, quase ninguém
    // "ficaria até o fim" e o sinal viraria ruído.
    const s = saidaDoParticipante({ joinedAt: INICIO, leftAt: em("2026-09-17T14:56:00Z") }, INICIO, FIM);
    assert.equal(s.tipo, "ficou_ate_o_fim");
  });

  it("sem saída registrada, ainda está na sala — não 'saiu no minuto zero'", () => {
    const s = saidaDoParticipante({ joinedAt: INICIO, leftAt: null }, INICIO, FIM);
    assert.deepEqual(s, { tipo: "ainda_na_sala" });
  });

  it("quem nunca entrou não tem minuto de saída", () => {
    assert.deepEqual(
      saidaDoParticipante({ joinedAt: null, leftAt: null }, INICIO, FIM),
      { tipo: "nunca_entrou" },
    );
  });

  it("quem entrou e saiu antes de a call começar não dá minuto negativo", () => {
    const s = saidaDoParticipante(
      { joinedAt: em("2026-09-17T13:35:00Z"), leftAt: em("2026-09-17T13:40:00Z") },
      INICIO,
      FIM,
    );
    assert.deepEqual(s, { tipo: "saiu_antes", minuto: 0 });
  });
});

describe("para quem ligar primeiro", () => {
  const p = (nome: string, attended: boolean, totalSeconds: number, score: string | null) => ({
    nome,
    attended,
    totalSeconds,
    lead: { score },
  });

  it("qualificado presente vem antes de não qualificado presente", () => {
    const ordenado = ordemDoRoster([
      p("C que ficou muito", true, 3000, "C"),
      p("A que ficou pouco", true, 400, "A"),
    ]);
    assert.deepEqual(ordenado.map((x) => x.nome), ["A que ficou pouco", "C que ficou muito"]);
  });

  it("dentro do mesmo grupo, quem ficou mais tempo vem antes", () => {
    const ordenado = ordemDoRoster([
      p("B curto", true, 600, "B"),
      p("A longo", true, 3000, "A"),
      p("A curto", true, 900, "A"),
    ]);
    assert.deepEqual(ordenado.map((x) => x.nome), ["A longo", "A curto", "B curto"]);
  });

  it("quem faltou vai para o fim mas NÃO some da lista", () => {
    // Ausência é trabalho também. Sumir com ela da tela é fingir que a vaga
    // nunca foi vendida.
    const ordenado = ordemDoRoster([
      p("faltou qualificado", false, 0, "A"),
      p("veio sem score", true, 100, null),
    ]);
    assert.deepEqual(ordenado.map((x) => x.nome), ["veio sem score", "faltou qualificado"]);
    assert.equal(ordenado.length, 2);
  });

  it("não altera a lista de origem", () => {
    const original = [p("x", true, 1, "A"), p("y", true, 2, "A")];
    ordemDoRoster(original);
    assert.equal(original[0].nome, "x");
  });
});

describe("quantas pessoas ouviram a oferta", () => {
  const sala = [
    { joinedAt: em("2026-09-17T14:00:00Z"), leftAt: em("2026-09-17T14:30:00Z") },
    { joinedAt: em("2026-09-17T14:05:00Z"), leftAt: null },
    { joinedAt: em("2026-09-17T14:50:00Z"), leftAt: em("2026-09-17T15:00:00Z") },
  ];

  it("conta quem estava lá naquele instante", () => {
    // O mesmo link no mesmo minuto conta histórias opostas: catorze pessoas
    // ouvindo, ou três que sobraram.
    assert.equal(naSalaEm(sala, em("2026-09-17T14:10:00Z")), 2);
    assert.equal(naSalaEm(sala, em("2026-09-17T14:40:00Z")), 1);
    assert.equal(naSalaEm(sala, em("2026-09-17T14:55:00Z")), 2);
  });

  it("quem ainda não chegou não conta", () => {
    assert.equal(naSalaEm(sala, em("2026-09-17T13:50:00Z")), 0);
  });

  it("a oferta mandada aos 41 min sabe dizer o minuto", () => {
    assert.equal(minutoDaCall(em("2026-09-17T14:41:00Z"), INICIO), 41);
  });

  it("mensagem escrita antes de a call começar é minuto zero, não negativo", () => {
    assert.equal(minutoDaCall(em("2026-09-17T13:45:00Z"), INICIO), 0);
  });
});
