import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  chaveDoDia,
  diaCivil,
  diaIso,
  diasEntre,
  hhmm,
  horaLocal,
  instanteDeCampoLocal,
  isSameDay,
  paraCampoLocal,
  weekDays,
  weekStart,
} from "../src/lib/dates";

/**
 * O bug que estes testes travam estava EM PRODUÇÃO.
 *
 * `new Date("2026-10-06T14:00")` — uma string sem fuso — é interpretada no
 * relógio de quem executa, por especificação. Na Vercel isso é UTC: a reunião
 * marcada para as 14:00 era gravada como 14:00Z, que são 11:00 em São Paulo.
 *
 * O erro passava despercebido porque a tela também formatava em UTC e as duas
 * pontas se cancelavam. Divergiam só onde importava: na página do convite, que
 * é a única que sempre declarou o fuso, e na janela de abertura da sala.
 *
 * Nada aqui pode depender do `TZ` de quem roda o teste. É o ponto.
 */

describe("campo datetime-local", () => {
  it("14:00 digitado é 17:00 UTC no horário padrão de Brasília", () => {
    const instante = instanteDeCampoLocal("2026-10-06T14:00");
    assert.equal(instante?.toISOString(), "2026-10-06T17:00:00.000Z");
  });

  it("não depende do fuso de quem roda o teste", () => {
    // Se usasse `new Date(str)`, este valor mudaria conforme o TZ do processo —
    // que é exatamente o defeito.
    assert.equal(
      instanteDeCampoLocal("2026-10-06T14:00")?.toISOString(),
      "2026-10-06T17:00:00.000Z",
    );
  });

  it("volta ao mesmo texto que o campo mostra", () => {
    const original = "2026-10-06T14:00";
    const instante = instanteDeCampoLocal(original)!;
    assert.equal(paraCampoLocal(instante), original);
  });

  it("aceita segundos no valor, que alguns navegadores mandam", () => {
    assert.equal(
      instanteDeCampoLocal("2026-10-06T14:00:00")?.toISOString(),
      "2026-10-06T17:00:00.000Z",
    );
  });

  it("recusa lixo em vez de virar Invalid Date silencioso", () => {
    for (const ruim of ["", "amanhã", "2026-10-06", "06/10/2026 14:00"]) {
      assert.equal(instanteDeCampoLocal(ruim), null, ruim);
    }
  });

  it("no horário de verão do Sul, a mesma hora de parede tem outro deslocamento", () => {
    // São Paulo não tem mais horário de verão, mas o fuso é parâmetro — e uma
    // série pode declarar outro. Nova York prova que a função não assume -03.
    assert.equal(
      instanteDeCampoLocal("2026-01-15T14:00", "America/New_York")?.toISOString(),
      "2026-01-15T19:00:00.000Z",
      "janeiro: -05",
    );
    assert.equal(
      instanteDeCampoLocal("2026-07-15T14:00", "America/New_York")?.toISOString(),
      "2026-07-15T18:00:00.000Z",
      "julho: -04",
    );
  });
});

describe("leitura de dia e hora no fuso", () => {
  // 03:00Z do dia 7 é 00:00 do dia 7 em São Paulo. Uma hora antes ainda é dia 6.
  const viradaDoDia = new Date("2026-10-07T03:00:00.000Z");
  const antesDaVirada = new Date("2026-10-07T02:59:00.000Z");

  it("hhmm mostra a hora daqui, não a do servidor", () => {
    assert.equal(hhmm(new Date("2026-10-06T17:00:00.000Z")), "14:00");
  });

  it("horaLocal põe a reunião na linha certa da grade", () => {
    assert.equal(horaLocal(new Date("2026-10-06T17:00:00.000Z")), 14);
    assert.equal(horaLocal(viradaDoDia), 0, "meia-noite é 0, nunca 24");
  });

  it("o dia civil vira na meia-noite de São Paulo", () => {
    assert.equal(chaveDoDia(antesDaVirada), "2026-10-06");
    assert.equal(chaveDoDia(viradaDoDia), "2026-10-07");
    assert.deepEqual(diaCivil(viradaDoDia), { ano: 2026, mes: 10, dia: 7 });
  });

  it("isSameDay compara dias daqui", () => {
    assert.equal(isSameDay(antesDaVirada, viradaDoDia), false);
    assert.equal(isSameDay(viradaDoDia, new Date("2026-10-08T02:00:00.000Z")), true);
  });

  it("diaIso numera de segunda a domingo", () => {
    // 05/10/2026 é uma segunda-feira.
    assert.equal(diaIso(instanteDeCampoLocal("2026-10-05T10:00")!), 1);
    assert.equal(diaIso(instanteDeCampoLocal("2026-10-11T10:00")!), 7, "domingo é 7");
  });

  it("diasEntre conta dias de calândario daqui", () => {
    // 23:00 de um dia e 01:00 do seguinte, em São Paulo: um dia de distância,
    // mesmo com só duas horas entre eles.
    const noite = instanteDeCampoLocal("2026-10-06T23:00")!;
    const madrugada = instanteDeCampoLocal("2026-10-07T01:00")!;
    assert.equal(diasEntre(noite, madrugada), 1);
    assert.equal(diasEntre(madrugada, noite), -1);
  });
});

describe("semana", () => {
  it("começa na meia-noite de segunda AQUI, não em UTC", () => {
    // Quarta, 07/10/2026. A segunda daquela semana é 05/10.
    const quarta = instanteDeCampoLocal("2026-10-07T15:00")!;
    const inicio = weekStart(quarta);
    assert.equal(inicio.toISOString(), "2026-10-05T03:00:00.000Z", "00:00 em SP = 03:00Z");
    assert.equal(chaveDoDia(inicio), "2026-10-05");
  });

  it("a segunda-feira continua sendo segunda no domingo à noite", () => {
    // Domingo 11/10 às 22:00 daqui é segunda 01:00Z. Com o relógio do servidor
    // a semana pulava para a seguinte três horas cedo demais.
    const domingoTarde = instanteDeCampoLocal("2026-10-11T22:00")!;
    assert.equal(chaveDoDia(weekStart(domingoTarde)), "2026-10-05");
  });

  it("o deslocamento anda de semana em semana", () => {
    const quarta = instanteDeCampoLocal("2026-10-07T15:00")!;
    assert.equal(chaveDoDia(weekStart(quarta, -1)), "2026-09-28");
    assert.equal(chaveDoDia(weekStart(quarta, 1)), "2026-10-12");
  });

  it("os sete dias são dias de calendário consecutivos", () => {
    const dias = weekDays(weekStart(instanteDeCampoLocal("2026-10-07T15:00")!));
    assert.deepEqual(
      dias.map((d) => chaveDoDia(d)),
      [
        "2026-10-05",
        "2026-10-06",
        "2026-10-07",
        "2026-10-08",
        "2026-10-09",
        "2026-10-10",
        "2026-10-11",
      ],
    );
  });

  it("atravessa a virada do mês sem perder um dia", () => {
    const dias = weekDays(weekStart(instanteDeCampoLocal("2026-10-29T12:00")!));
    assert.equal(chaveDoDia(dias[0]), "2026-10-26");
    assert.equal(chaveDoDia(dias[6]), "2026-11-01");
  });
});
