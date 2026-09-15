import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { instanteLocal, TZ } from "../src/lib/dates";

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
