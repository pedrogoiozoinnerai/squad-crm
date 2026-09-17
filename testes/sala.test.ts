import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ABRE_ANTES_MIN, janelaDaSala, situacaoDaSala } from "../src/lib/sala";

/**
 * Quando a sala está aberta.
 *
 * Duas coisas leem esta função e precisam concordar: a página que mostra o
 * botão "entrar" e a rota que emite o token. Divergindo, o lead vê um botão que
 * a API recusa — e o erro aparece depois do clique, no minuto em que a reunião
 * ia começar.
 */

const em = (iso: string) => new Date(iso);
const REUNIAO = {
  startsAt: em("2026-09-17T14:00:00Z"),
  endsAt: em("2026-09-17T15:00:00Z"),
  status: "SCHEDULED",
};

describe("a janela da sala", () => {
  it("abre meia hora antes — quem chega adiantado espera dentro", () => {
    assert.equal(
      janelaDaSala(REUNIAO).abreEm.toISOString(),
      em("2026-09-17T13:30:00Z").toISOString(),
    );
    assert.equal(ABRE_ANTES_MIN, 30);
  });

  it("antes disso, ainda não abriu", () => {
    assert.equal(situacaoDaSala(REUNIAO, em("2026-09-17T13:29:00Z")), "esperando");
  });

  it("dentro da janela, aberta", () => {
    assert.equal(situacaoDaSala(REUNIAO, em("2026-09-17T14:30:00Z")), "aberta");
  });

  it("fecha bem depois — call que emenda não expulsa ninguém", () => {
    assert.equal(situacaoDaSala(REUNIAO, em("2026-09-17T16:59:00Z")), "aberta");
    assert.equal(situacaoDaSala(REUNIAO, em("2026-09-17T17:01:00Z")), "encerrada");
  });
});

describe("encerrar para todos", () => {
  it("DONE fecha a sala mesmo dentro do horário", () => {
    // Sem isto, "encerrar a sessão para todos" só derrubava a conexão: o link
    // continuava valendo, e quem recarregasse reabria a sala e ficava lá
    // sozinho esperando alguém.
    const encerrada = { ...REUNIAO, status: "DONE" };
    assert.equal(situacaoDaSala(encerrada, em("2026-09-17T14:30:00Z")), "encerrada");
  });

  it("e continua fechada no F5 seguinte", () => {
    const encerrada = { ...REUNIAO, status: "DONE" };
    for (const t of ["14:31", "14:45", "15:30"]) {
      assert.equal(situacaoDaSala(encerrada, em(`2026-09-17T${t}:00Z`)), "encerrada");
    }
  });

  it("cancelada continua sendo outra coisa — a frase que o lead lê é outra", () => {
    const cancelada = { ...REUNIAO, status: "CANCELED" };
    assert.equal(situacaoDaSala(cancelada, em("2026-09-17T14:30:00Z")), "cancelada");
  });

  it("cancelada vence até antes de abrir", () => {
    const cancelada = { ...REUNIAO, status: "CANCELED" };
    assert.equal(situacaoDaSala(cancelada, em("2026-09-17T10:00:00Z")), "cancelada");
  });

  it("NO_SHOW não fecha — ninguém veio, mas ainda pode vir", () => {
    const semNinguem = { ...REUNIAO, status: "NO_SHOW" };
    assert.equal(situacaoDaSala(semNinguem, em("2026-09-17T14:30:00Z")), "aberta");
  });
});
