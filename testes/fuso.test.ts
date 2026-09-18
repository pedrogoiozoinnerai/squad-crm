import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  TZ,
  inicioDoDia,
  inicioDoMes,
  instanteLocal,
} from "../src/lib/dates";
import { fimDoMes } from "../src/lib/horizonte";

/** O dia de calendário como a coluna `date` guarda: 00:00 UTC. */
const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/**
 * A grade de sessões mostrava 07:00 numa sessão das 10:00 — em produção, para
 * o time inteiro. A causa era `new Date(date).setHours(10)`, que usa o fuso do
 * SERVIDOR: na máquina do dev é São Paulo e parece certo, na Vercel é UTC.
 *
 * Estes testes não dependem do fuso de quem os roda. É o ponto.
 */
describe("instante local", () => {
  it("10:00 em São Paulo é 13:00 UTC no horário padrão", () => {
    assert.equal(instanteLocal(dia("2026-09-15"), "10:00").toISOString(), "2026-09-15T13:00:00.000Z");
  });

  it("não depende do fuso de quem roda o teste", () => {
    // Se usasse o relógio do servidor, este valor mudaria de máquina para
    // máquina — que é exatamente o defeito que estamos corrigindo.
    const esperado = "2026-09-15T13:00:00.000Z";
    assert.equal(instanteLocal(dia("2026-09-15"), "10:00", TZ).toISOString(), esperado);
  });

  it("meia-noite não escorrega para o dia anterior", () => {
    // `hour12: false` devolve 24 à meia-noite em alguns runtimes; tratar 24
    // como 24 jogaria o instante 24 horas à frente.
    assert.equal(instanteLocal(dia("2026-09-15"), "00:00").toISOString(), "2026-09-15T03:00:00.000Z");
  });

  it("aceita hora sem zero à esquerda e minuto quebrado", () => {
    assert.equal(instanteLocal(dia("2026-09-15"), "9:30").toISOString(), "2026-09-15T12:30:00.000Z");
  });

  it("hora inválida vira meia-noite em vez de Invalid Date", () => {
    // `time` é String livre no schema; um valor torto não pode derrubar a
    // página inteira na consulta do Prisma.
    assert.equal(instanteLocal(dia("2026-09-15"), "").toISOString(), "2026-09-15T03:00:00.000Z");
  });

  it("dia gravado às 03:00Z (runtime em São Paulo) cai no mesmo dia", () => {
    // O seed local grava 00:00 de São Paulo = 03:00Z; a Vercel gravaria 00:00Z.
    // As duas leituras têm que dar o mesmo horário de parede.
    const gravadoEmSP = new Date("2026-09-15T03:00:00.000Z");
    assert.equal(
      instanteLocal(gravadoEmSP, "10:00").toISOString(),
      instanteLocal(dia("2026-09-15"), "10:00").toISOString(),
    );
  });
});

/**
 * O Brasil não tem horário de verão desde 2019, mas o histórico importado do
 * HubSpot atravessa os anos em que tinha — e o fuso é parâmetro, então um dia
 * isto roda para outro país.
 */
describe("horário de verão", () => {
  it("São Paulo em 2018 estava em -02", () => {
    // 15/01/2018: horário de verão vigente. 10:00 local = 12:00 UTC, não 13:00.
    assert.equal(instanteLocal(dia("2018-01-15"), "10:00").toISOString(), "2018-01-15T12:00:00.000Z");
  });

  it("a mesma hora de parede muda de deslocamento conforme a estação", () => {
    // Compara o DESLOCAMENTO em relação ao UTC, não o instante absoluto:
    // janeiro e julho estão a seis meses um do outro de qualquer jeito.
    const desvio = (iso: string) => {
      const real = instanteLocal(dia(iso), "10:00").getTime();
      const ingenuo = new Date(`${iso}T10:00:00.000Z`).getTime();
      return (real - ingenuo) / 3_600_000;
    };
    assert.equal(desvio("2018-01-15"), 2, "verão: UTC-2");
    assert.equal(desvio("2018-07-15"), 3, "inverno: UTC-3");
  });

  it("atravessa a virada de outro fuso sem pular uma hora", () => {
    // Nova York entra no horário de verão em 08/03/2026 às 02:00 local.
    // 12:00 no dia seguinte é -04, não -05.
    assert.equal(
      instanteLocal(dia("2026-03-09"), "12:00", "America/New_York").toISOString(),
      "2026-03-09T16:00:00.000Z",
    );
    assert.equal(
      instanteLocal(dia("2026-03-07"), "12:00", "America/New_York").toISOString(),
      "2026-03-07T17:00:00.000Z",
    );
  });
});

describe("início do dia e do mês, no fuso e não no processo", () => {
  // Estes dois nasceram de defeito medido em `queries.ts`: `setHours(0,0,0,0)`
  // no filtro de prazo e `new Date(ano, getMonth(), 1)` no painel. Na Vercel,
  // que roda em UTC, os dois liam o relógio errado — e o teste roda nos dois
  // fusos justamente para prender isso.

  it("meia-noite é a de São Paulo, não a do processo", () => {
    // 17/09 às 23:30 em SP = 18/09 02:30 UTC. O dia civil ainda é 17.
    const tardeDaNoite = new Date("2026-09-18T02:30:00Z");
    assert.equal(inicioDoDia(tardeDaNoite).toISOString(), "2026-09-17T03:00:00.000Z");
  });

  it("e não muda conforme quem executa", () => {
    const meioDia = new Date("2026-09-17T15:00:00Z");
    assert.equal(inicioDoDia(meioDia).toISOString(), "2026-09-17T03:00:00.000Z");
  });

  it("o mês vira à meia-noite de São Paulo", () => {
    // 30/09 às 22:00 em SP é 01/10 01:00 UTC: ainda é setembro para nós.
    const ultimaNoite = new Date("2026-10-01T01:00:00Z");
    assert.equal(inicioDoMes(ultimaNoite).toISOString(), "2026-09-01T03:00:00.000Z");
  });

  it("o primeiro instante do mês pertence ao próprio mês", () => {
    const primeiro = new Date("2026-09-01T03:00:00Z");
    assert.equal(inicioDoMes(primeiro).toISOString(), "2026-09-01T03:00:00.000Z");
  });

  it("fevereiro bissexto: o mês seguinte começa em março, não em 04/03", () => {
    // O defeito era `addDays(inicioMes, 31)` como "fim do mês".
    const fev = new Date("2028-02-15T15:00:00Z");
    assert.equal(inicioDoMes(fev).toISOString(), "2028-02-01T03:00:00.000Z");
    assert.equal(fimDoMes(fev).toISOString(), "2028-03-01T02:59:59.999Z");
  });

  it("janeiro vira dezembro para trás sem estourar o ano", () => {
    const jan = new Date("2026-01-10T15:00:00Z");
    assert.equal(inicioDoMes(jan).toISOString(), "2026-01-01T03:00:00.000Z");
  });
});
