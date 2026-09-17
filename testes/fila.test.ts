import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  aposFalhar,
  ARRENDAMENTO_MS,
  backoff,
  chaveDoTrabalho,
  desistir,
  ESPERA_MAX_MS,
  MAX_TENTATIVAS,
  proximoPasso,
  type Trabalho,
} from "../src/lib/fila";

/**
 * A fila que fala com provedor pago.
 *
 * O erro caro aqui não é lentidão — é mandar o mesmo áudio de uma hora duas
 * vezes porque duas execuções pegaram o mesmo trabalho. Metade destes casos
 * existe só para prender isso.
 */

const AGORA = new Date("2026-09-17T15:00:00Z");
const em = (min: number) => new Date(AGORA.getTime() + min * 60_000);

const trabalho = (t: Partial<Trabalho> = {}): Trabalho => ({
  estado: "PENDENTE",
  tentativas: 0,
  arrendadoAte: null,
  proximaTentativaEm: null,
  ...t,
});

describe("a chave é de negócio", () => {
  it("o mesmo alvo na mesma etapa dá a mesma chave", () => {
    // É isso que faz dois crons sobrepostos criarem UM trabalho — e não dois
    // pedidos pagos ao mesmo provedor pelo mesmo áudio.
    assert.equal(chaveDoTrabalho("TRANSCREVER", "rec_1"), chaveDoTrabalho("TRANSCREVER", "rec_1"));
  });

  it("etapas diferentes sobre o mesmo alvo são trabalhos diferentes", () => {
    assert.notEqual(chaveDoTrabalho("TRANSCREVER", "rec_1"), chaveDoTrabalho("ANALISAR", "rec_1"));
  });
});

describe("quanto esperar entre tentativas", () => {
  it("dobra a partir de um minuto", () => {
    assert.equal(backoff(1), 60_000);
    assert.equal(backoff(2), 120_000);
    assert.equal(backoff(3), 240_000);
  });

  it("para em trinta minutos", () => {
    // Sem o teto, a sexta tentativa cairia trinta e duas vezes depois da
    // primeira, e um provedor que voltou em cinco minutos ficaria meia hora
    // sem ser procurado.
    assert.equal(backoff(10), 30 * 60_000);
    assert.equal(backoff(99), 30 * 60_000);
  });

  it("tentativa zero não vira espera negativa", () => {
    assert.ok(backoff(0) > 0);
  });
});

describe("o que fazer com o trabalho agora", () => {
  it("nascido agora, executa", () => {
    assert.deepEqual(proximoPasso(trabalho(), AGORA), { acao: "tentar" });
  });

  it("arrendado a outra execução: NÃO executa", () => {
    // O caso que custa dinheiro. Uma função de 60 s some no meio da chamada ao
    // provedor; a execução seguinte, um minuto depois, pegaria o mesmo áudio.
    const ocupado = trabalho({ arrendadoAte: em(3) });
    assert.deepEqual(proximoPasso(ocupado, AGORA), { acao: "ocupado" });
  });

  it("o arrendamento vencido devolve o trabalho sozinho", () => {
    // Sem isto, uma execução que morre trava o trabalho para sempre — e o
    // conserto seria ir no banco à mão.
    assert.deepEqual(proximoPasso(trabalho({ arrendadoAte: em(-1) }), AGORA), { acao: "tentar" });
  });

  it("o arrendamento é maior que o teto da função", () => {
    // Menor que 60 s e a segunda execução pega o trabalho enquanto a primeira
    // ainda está falando com o provedor.
    assert.ok(ARRENDAMENTO_MS > 60_000);
  });

  it("antes da hora, espera", () => {
    assert.deepEqual(
      proximoPasso(trabalho({ tentativas: 1, proximaTentativaEm: em(1) }), AGORA),
      { acao: "esperar" },
    );
  });

  it("depois de seis tentativas, para", () => {
    // Passou disso não é instabilidade de rede: é chave errada, formato
    // recusado ou conta sem saldo, e nada disso melhora tentando de novo.
    assert.deepEqual(proximoPasso(trabalho({ tentativas: MAX_TENTATIVAS }), AGORA), {
      acao: "desistir",
    });
    assert.equal(desistir(MAX_TENTATIVAS - 1), false);
  });

  it("pronto e desistiu não voltam à fila", () => {
    assert.deepEqual(proximoPasso(trabalho({ estado: "PRONTO" }), AGORA), { acao: "nada" });
    assert.deepEqual(proximoPasso(trabalho({ estado: "DESISTIU" }), AGORA), { acao: "nada" });
  });
});

describe("esperando o provedor responder", () => {
  it("dentro do prazo, não mexe", () => {
    const esperando = trabalho({ estado: "AGUARDANDO", updatedAt: em(-10) });
    assert.deepEqual(proximoPasso(esperando, AGORA), { acao: "ocupado" });
  });

  it("callback que nunca veio vira tentativa, não silêncio eterno", () => {
    // Callback perdido não dá erro em lugar nenhum. Sem prazo, o trabalho fica
    // `AGUARDANDO` para sempre e a gravação nunca tem transcrição — e ninguém
    // descobre, porque nada falhou.
    const perdido = trabalho({
      estado: "AGUARDANDO",
      updatedAt: new Date(AGORA.getTime() - ESPERA_MAX_MS - 1000),
    });
    assert.deepEqual(proximoPasso(perdido, AGORA), { acao: "reenfileirar" });
  });

  it("mas na última tentativa, desiste em vez de reenfileirar", () => {
    const perdido = trabalho({
      estado: "AGUARDANDO",
      tentativas: MAX_TENTATIVAS - 1,
      updatedAt: new Date(AGORA.getTime() - ESPERA_MAX_MS - 1000),
    });
    assert.deepEqual(proximoPasso(perdido, AGORA), { acao: "desistir" });
  });
});

describe("depois de falhar", () => {
  it("conta a tentativa e marca a hora da próxima", () => {
    const d = aposFalhar(trabalho({ tentativas: 1 }), AGORA, "500 do provedor");
    assert.equal(d.tentativas, 2);
    assert.equal(d.estado, "PENDENTE");
    assert.equal(d.arrendadoAte, null, "solta o arrendamento");
    assert.equal(d.proximaTentativaEm.toISOString(), em(2).toISOString());
  });

  it("na última, desiste", () => {
    const d = aposFalhar(trabalho({ tentativas: MAX_TENTATIVAS - 1 }), AGORA, "x");
    assert.equal(d.estado, "DESISTIU");
  });

  it("a mensagem do provedor é truncada", () => {
    // Um provedor devolve o corpo inteiro da resposta dentro da mensagem de
    // erro, e isso não cabe numa coluna.
    const d = aposFalhar(trabalho(), AGORA, "x".repeat(5000));
    assert.equal(d.erro.length, 500);
  });
});
