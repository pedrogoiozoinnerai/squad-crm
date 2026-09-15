import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { diasDaSemana, slotsDaSerie } from "../src/lib/slots";

const base = { time: "10:00", timezone: "America/Sao_Paulo" };
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
      { weekdays: "1", time: "10:00", timezone: "America/New_York" },
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
