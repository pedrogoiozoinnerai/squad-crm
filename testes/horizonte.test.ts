import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { chaveDoDia, instanteDeCampoLocal } from "../src/lib/dates";
import {
  agendaAcabando,
  diasDeAgenda,
  fimDoMes,
  horizonteDaAgenda,
} from "../src/lib/horizonte";

const em = (valor: string) => instanteDeCampoLocal(valor)!;

describe("fim do mês", () => {
  it("é o último instante do mês, no fuso daqui", () => {
    const fim = fimDoMes(em("2026-10-06T14:00"));
    assert.equal(chaveDoDia(fim), "2026-10-31");
    // 00:00 de 1º/11 em São Paulo é 03:00Z; um milissegundo antes disso.
    assert.equal(fim.toISOString(), "2026-11-01T02:59:59.999Z");
  });

  it("acerta os meses de 30 dias", () => {
    assert.equal(chaveDoDia(fimDoMes(em("2026-11-10T09:00"))), "2026-11-30");
    assert.equal(chaveDoDia(fimDoMes(em("2026-04-01T09:00"))), "2026-04-30");
  });

  it("vira o ano em dezembro", () => {
    const fim = fimDoMes(em("2026-12-25T23:00"));
    assert.equal(chaveDoDia(fim), "2026-12-31");
    assert.equal(fim.toISOString(), "2027-01-01T02:59:59.999Z");
  });

  it("fevereiro bissexto sai sem tabela de dias", () => {
    assert.equal(chaveDoDia(fimDoMes(em("2028-02-03T10:00"))), "2028-02-29");
    assert.equal(chaveDoDia(fimDoMes(em("2026-02-03T10:00"))), "2026-02-28");
  });

  it("no último dia do mês, o fim ainda é aquele dia", () => {
    // Às 23:00 do dia 31 continua sendo outubro — este é o caso que um
    // `getMonth()` em UTC erraria, porque lá já seria 02:00 de novembro.
    assert.equal(chaveDoDia(fimDoMes(em("2026-10-31T23:00"))), "2026-10-31");
  });

  it("um instante já dentro do último milissegundo não pula de mês", () => {
    const fim = fimDoMes(em("2026-10-06T14:00"));
    assert.equal(fimDoMes(fim).getTime(), fim.getTime());
  });
});

describe("horizonte da agenda", () => {
  it("é estrito: o fim do mês corrente, e nada além", () => {
    assert.equal(chaveDoDia(horizonteDaAgenda(em("2026-10-01T08:00"))), "2026-10-31");
    assert.equal(chaveDoDia(horizonteDaAgenda(em("2026-10-30T20:00"))), "2026-10-31");
  });

  it("no fim do mês encolhe mesmo — é a consequência aceita", () => {
    assert.equal(diasDeAgenda(em("2026-10-01T08:00")), 30);
    assert.equal(diasDeAgenda(em("2026-10-30T20:00")), 1);
    assert.equal(diasDeAgenda(em("2026-10-31T20:00")), 0);
  });

  it("avisa quando está acabando, para ninguém descobrir pelo lead", () => {
    assert.equal(agendaAcabando(em("2026-10-20T08:00")), false);
    assert.equal(agendaAcabando(em("2026-10-26T08:00")), false, "5 dias ainda não avisa");
    assert.equal(agendaAcabando(em("2026-10-27T08:00")), true, "4 dias avisa");
    assert.equal(agendaAcabando(em("2026-10-31T08:00")), true);
  });

  it("não depende do fuso de quem roda", () => {
    // 22:00 do dia 31 daqui é 01:00 do dia 1º em UTC. Se a conta usasse o
    // relógio do processo, o horizonte pularia para novembro cedo demais.
    assert.equal(chaveDoDia(horizonteDaAgenda(em("2026-10-31T22:00"))), "2026-10-31");
  });
});
