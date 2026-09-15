import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { diasDaSemana, horariosDaSerie, LIMITE_DE_SLOTS, slotsDaSerie } from "../src/lib/slots";

const base = { times: "10:00", timezone: "America/Sao_Paulo" };
const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("dias da semana da série", () => {
  it("lê o CSV e ordena", () => {
    assert.deepEqual(diasDaSemana("3,1,5"), [1, 3, 5]);
  });

  it("descarta lixo em vez de quebrar", () => {
    // `weekdays` é String livre no schema: um valor torto não pode derrubar o
    // materializador no meio da noite.
    assert.deepEqual(diasDaSemana("0,8,-1,abc,3"), [3]);
    assert.deepEqual(diasDaSemana(""), []);
  });

  it("não repete o mesmo dia", () => {
    assert.deepEqual(diasDaSemana("2,2,2"), [2]);
  });
});

describe("slots da série", () => {
  it("toda terça às 10:00 por quatro semanas", () => {
    // 15/09/2026 é uma terça. A janela vai até o dia 14/10 para conter a
    // sessão do dia 13: o fim é um INSTANTE, e a sessão das 10:00 do dia 13
    // acontece depois da meia-noite daquele dia.
    const slots = slotsDaSerie({ ...base, weekdays: "2" }, dia("2026-09-15"), dia("2026-10-14"));
    assert.equal(slots.length, 5);
    assert.equal(slots[0].toISOString(), "2026-09-15T13:00:00.000Z", "10:00 em SP = 13:00 UTC");
    for (const s of slots) assert.equal(s.getUTCDay(), 2, "todas terças");
  });

  it("o fim da janela é instante, não dia", () => {
    // Meia-noite do dia 13 NÃO alcança a sessão das 10:00 daquele dia — e é o
    // que faz o materializador não criar uma sessão além do horizonte pedido.
    const ate13 = slotsDaSerie({ ...base, weekdays: "2" }, dia("2026-09-15"), dia("2026-10-13"));
    assert.equal(ate13.length, 4);
  });

  it("série sem dias não gera nada", () => {
    assert.deepEqual(slotsDaSerie({ ...base, weekdays: "" }, dia("2026-09-01"), dia("2026-12-01")), []);
  });

  it("respeita início e fim da série", () => {
    const serie = { ...base, weekdays: "2", startsOn: dia("2026-09-22"), endsOn: dia("2026-09-30") };
    const slots = slotsDaSerie(serie, dia("2026-09-01"), dia("2026-10-31"));
    assert.equal(slots.length, 2, "22 e 29 de setembro");
  });

  it("atravessa o horário de verão sem deslocar a série", () => {
    // Nova York entra no horário de verão em 08/03/2026. A hora de PAREDE tem
    // que continuar 10:00 nos dois lados — é o que quebra quando se anda de 24
    // em 24 horas a partir do primeiro instante.
    const slots = slotsDaSerie(
      { weekdays: "1", times: "10:00", timezone: "America/New_York" },
      dia("2026-03-02"),
      dia("2026-03-17"),
    );
    const parede = (d: Date) =>
      new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York", hour: "2-digit", hour12: false,
      }).format(d);
    assert.equal(slots.length, 3);
    for (const s of slots) assert.equal(parede(s), "10", "sempre 10h locais");
    // E os instantes em UTC de fato diferem, porque o fuso mudou no meio.
    assert.notEqual(slots[0].getUTCHours(), slots[2].getUTCHours());
  });

  it("não devolve slot fora da janela pedida", () => {
    const slots = slotsDaSerie({ ...base, weekdays: "1,2,3,4,5" }, dia("2026-09-15"), dia("2026-09-18"));
    for (const s of slots) {
      assert.ok(s >= dia("2026-09-15") && s <= dia("2026-09-18"), s.toISOString());
    }
  });

  it("janela absurda não vira laço infinito", () => {
    const slots = slotsDaSerie({ ...base, weekdays: "1" }, dia("2026-01-01"), dia("2099-01-01"));
    assert.ok(slots.length < 100, `teto respeitado (${slots.length})`);
  });
});

describe("horários da série", () => {
  it("lê a lista e ordena", () => {
    assert.deepEqual(horariosDaSerie("10:00,08:00,09:00"), ["08:00", "09:00", "10:00"]);
  });

  it("normaliza a hora de um dígito", () => {
    // O `<input type="time">` manda "08:00", mas quem digitar o CSV à mão
    // escreve "8:00" — e as duas são o mesmo horário.
    assert.deepEqual(horariosDaSerie("8:00,08:00"), ["08:00"]);
  });

  it("descarta lixo em vez de quebrar o materializador de madrugada", () => {
    assert.deepEqual(horariosDaSerie("25:00,10:60,abc,,10:00"), ["10:00"]);
    assert.deepEqual(horariosDaSerie(""), []);
  });

  it("corta em 24: mais horários que horas no dia é sempre engano", () => {
    const muitos = Array.from({ length: 40 }, (_, i) => `${String(i % 24).padStart(2, "0")}:30`);
    assert.equal(horariosDaSerie(muitos.join(",")).length, 24);
  });
});

describe("série com vários horários por dia", () => {
  /// O pedido real: 08:00 às 20:00, de hora em hora.
  const TREZE = Array.from({ length: 13 }, (_, i) => `${String(i + 8).padStart(2, "0")}:00`).join(",");

  it("gera 13 horários em cada dia da série", () => {
    // 15/09/2026 é terça. Janela de uma terça só.
    const slots = slotsDaSerie(
      { ...base, weekdays: "2", times: TREZE },
      dia("2026-09-15"),
      dia("2026-09-16"),
    );
    assert.equal(slots.length, 13);
    assert.equal(slots[0].toISOString(), "2026-09-15T11:00:00.000Z", "08:00 em SP");
    assert.equal(slots[12].toISOString(), "2026-09-15T23:00:00.000Z", "20:00 em SP");
  });

  it("sai em ordem cronológica — o corte do materializador conta com isso", () => {
    const slots = slotsDaSerie(
      { ...base, weekdays: "1,2,3,4,5,6", times: TREZE },
      dia("2026-09-14"),
      dia("2026-09-20"),
    );
    for (let i = 1; i < slots.length; i++) {
      assert.ok(slots[i] > slots[i - 1], `slot ${i} depois do anterior`);
    }
  });

  it("seg a sáb, 13 por dia, um mês inteiro", () => {
    // Outubro de 2026 tem 27 dias de segunda a sábado.
    const slots = slotsDaSerie(
      { ...base, weekdays: "1,2,3,4,5,6", times: TREZE },
      dia("2026-10-01"),
      new Date("2026-11-01T02:59:59.999Z"),
    );
    assert.equal(slots.length, 27 * 13, "27 dias úteis-com-sábado × 13 horários");
    // Nenhum domingo.
    for (const s of slots) assert.notEqual(s.getUTCDay(), 0);
  });

  it("o teto de slots corta a CAUDA, e o chamador consegue perceber", () => {
    const slots = slotsDaSerie(
      { ...base, weekdays: "1,2,3,4,5,6,7", times: TREZE },
      dia("2026-01-01"),
      dia("2099-01-01"),
    );
    assert.equal(slots.length, LIMITE_DE_SLOTS);
    // Ordenado e truncado no fim: o começo da janela está inteiro.
    assert.equal(slots[0].toISOString(), "2026-01-01T11:00:00.000Z");
  });

  it("cada horário mantém sua hora de parede na virada do horário de verão", () => {
    const parede = (d: Date) =>
      new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York", hour: "2-digit", hour12: false,
      }).format(d);
    const slots = slotsDaSerie(
      { weekdays: "1", times: "09:00,13:00,17:00", timezone: "America/New_York" },
      dia("2026-03-02"),
      dia("2026-03-17"),
    );
    assert.equal(slots.length, 9, "3 segundas × 3 horários");
    const horas = slots.map(parede);
    assert.deepEqual(horas, ["09", "13", "17", "09", "13", "17", "09", "13", "17"]);
  });

  it("série sem horário nenhum não gera nada", () => {
    assert.deepEqual(
      slotsDaSerie({ ...base, weekdays: "1,2,3", times: "" }, dia("2026-09-01"), dia("2026-12-01")),
      [],
    );
  });
});
