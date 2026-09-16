import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  avaliar,
  chaveDoBalde,
  fimDaJanela,
  quemPede,
  REGRAS,
} from "../src/lib/limite";

const em = (iso: string) => new Date(iso);

describe("quem pede", () => {
  it("pega o primeiro endereço do x-forwarded-for", () => {
    // Os seguintes são os proxies pelo caminho; o cliente é o primeiro.
    assert.equal(quemPede("203.0.113.7, 10.0.0.1, 10.0.0.2"), "203.0.113.7");
    assert.equal(quemPede("203.0.113.7"), "203.0.113.7");
  });

  it("sem cabeçalho, todo mundo divide o mesmo balde", () => {
    // Limitar demais um ambiente sem proxy é melhor que não limitar nada.
    assert.equal(quemPede(null), "desconhecido");
    assert.equal(quemPede(""), "desconhecido");
    assert.equal(quemPede("   "), "desconhecido");
  });

  it("trunca: cabeçalho forjado não vira chave primária gigante", () => {
    const forjado = "a".repeat(8000);
    assert.equal(quemPede(forjado).length, 45, "tamanho de um IPv6");
  });
});

describe("chave do balde", () => {
  it("mesma janela, mesma chave", () => {
    const a = chaveDoBalde("reservar", "1.2.3.4", em("2026-09-16T14:30:05.000Z"));
    const b = chaveDoBalde("reservar", "1.2.3.4", em("2026-09-16T14:30:55.000Z"));
    assert.equal(a, b);
  });

  it("janela seguinte é outra chave — a virada é automática", () => {
    // É o ponto de pôr a janela na chave: não há contador para zerar nem
    // relógio para comparar. A linha nova nasce em 1.
    const a = chaveDoBalde("reservar", "1.2.3.4", em("2026-09-16T14:30:59.000Z"));
    const b = chaveDoBalde("reservar", "1.2.3.4", em("2026-09-16T14:31:00.000Z"));
    assert.notEqual(a, b);
  });

  it("separa por rota e por quem pede", () => {
    const agora = em("2026-09-16T14:30:00.000Z");
    assert.notEqual(
      chaveDoBalde("reservar", "1.2.3.4", agora),
      chaveDoBalde("disponibilidade", "1.2.3.4", agora),
    );
    assert.notEqual(
      chaveDoBalde("reservar", "1.2.3.4", agora),
      chaveDoBalde("reservar", "5.6.7.8", agora),
    );
  });
});

describe("fim da janela", () => {
  it("é o próximo múltiplo do tamanho da janela", () => {
    assert.equal(
      fimDaJanela(em("2026-09-16T14:30:05.000Z"), 60).toISOString(),
      "2026-09-16T14:31:00.000Z",
    );
  });

  it("no instante exato da virada, aponta para a janela seguinte", () => {
    assert.equal(
      fimDaJanela(em("2026-09-16T14:31:00.000Z"), 60).toISOString(),
      "2026-09-16T14:32:00.000Z",
    );
  });
});

describe("veredicto", () => {
  const regra = { teto: 10, janelaSegundos: 60 };
  const agora = em("2026-09-16T14:30:30.000Z");

  it("passa até o teto, inclusive", () => {
    assert.equal(avaliar(1, regra, agora).permitido, true);
    assert.equal(avaliar(10, regra, agora).permitido, true, "a décima ainda passa");
    assert.equal(avaliar(11, regra, agora).permitido, false);
  });

  it("conta quantas ainda cabem, sem passar de zero", () => {
    assert.equal(avaliar(1, regra, agora).restantes, 9);
    assert.equal(avaliar(10, regra, agora).restantes, 0);
    assert.equal(avaliar(50, regra, agora).restantes, 0, "nunca negativo");
  });

  it("diz quanto esperar, nunca zero", () => {
    // Zero num `Retry-After` convida o cliente a tentar imediatamente, que é
    // o oposto do que o cabeçalho existe para fazer.
    assert.equal(avaliar(11, regra, agora).esperarSegundos, 30);
    assert.ok(avaliar(11, regra, em("2026-09-16T14:30:59.999Z")).esperarSegundos >= 1);
  });
});

describe("as regras configuradas", () => {
  it("todas têm teto e janela positivos", () => {
    for (const [nome, r] of Object.entries(REGRAS)) {
      assert.ok(r.teto > 0, `${nome}: teto`);
      assert.ok(r.janelaSegundos > 0, `${nome}: janela`);
    }
  });

  it("reservar é mais apertado que consultar", () => {
    // Ler não muda nada; escrever muda. O teto reflete isso.
    assert.ok(REGRAS.reservar.teto < REGRAS.disponibilidade.teto);
  });
});
