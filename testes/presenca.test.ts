import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { atingiuPresenca, consolidar, veredicto, type EventoBruto } from "../src/lib/presenca";

const T = (minuto: number) => new Date(`2026-09-15T14:${String(minuto).padStart(2, "0")}:00Z`);

function entrou(identity: string, minuto: number, name?: string): EventoBruto {
  return { type: "participant_joined", at: T(minuto), identity, name: name ?? null };
}
function saiu(identity: string, minuto: number): EventoBruto {
  return { type: "participant_left", at: T(minuto), identity, name: null };
}

describe("consolidação de presença", () => {
  it("soma um par simples de entrada e saída", () => {
    const [p] = consolidar([entrou("l_1", 0, "Joana"), saiu("l_1", 30)], null);
    assert.equal(p.seconds, 30 * 60);
    assert.equal(p.name, "Joana");
    assert.deepEqual(p.leftAt, T(30));
  });

  it("soma os dois trechos de quem caiu e voltou", () => {
    // Queda de conexão é o caso normal, não a exceção. Contar só o primeiro
    // trecho subestimaria justamente quem ficou até o fim.
    const [p] = consolidar(
      [entrou("l_1", 0), saiu("l_1", 10), entrou("l_1", 12), saiu("l_1", 40)],
      null,
    );
    assert.equal(p.seconds, (10 + 28) * 60);
    assert.deepEqual(p.joinedAt, T(0), "primeira entrada");
    assert.deepEqual(p.leftAt, T(40), "última saída");
  });

  it("fecha no fim da sala quem nunca deu saída", () => {
    // Fechou a aba, acabou a bateria. Sem isso ficaria com zero segundo.
    const [p] = consolidar([entrou("l_1", 5)], T(50));
    assert.equal(p.seconds, 45 * 60);
    assert.deepEqual(p.leftAt, T(50));
  });

  it("com a sala ainda aberta, conta zero e deixa a saída em aberto", () => {
    const [p] = consolidar([entrou("l_1", 5)], null);
    assert.equal(p.leftAt, null);
    assert.equal(p.seconds, 0);
  });

  it("entrada repetida sem saída não duplica o tempo", () => {
    // Saída perdida: o total tem que ser o mesmo de uma sessão contínua.
    const [comRepeticao] = consolidar([entrou("l_1", 0), entrou("l_1", 10), saiu("l_1", 30)], null);
    const [continua] = consolidar([entrou("l_1", 0), saiu("l_1", 30)], null);
    assert.equal(comRepeticao.seconds, continua.seconds);
  });

  it("saída sem entrada não gera tempo negativo", () => {
    assert.deepEqual(consolidar([saiu("l_1", 10)], null), []);
  });

  it("separa os participantes e ignora eventos de sala", () => {
    const p = consolidar(
      [
        { type: "room_started", at: T(0), identity: null, name: null },
        entrou("u_vendedor", 0),
        entrou("l_lead", 5),
        saiu("l_lead", 35),
        saiu("u_vendedor", 40),
      ],
      null,
    );
    assert.equal(p.length, 2);
    assert.equal(p[0].identity, "u_vendedor");
    assert.equal(p[1].seconds, 30 * 60);
  });

  it("ordena por si só: evento fora de ordem não muda a conta", () => {
    // Reentrega do LiveKit chega fora de ordem o tempo todo.
    const [p] = consolidar([saiu("l_1", 30), entrou("l_1", 0)], null);
    assert.equal(p.seconds, 30 * 60);
  });
});

describe("regra de presença", () => {
  const regra = { presencaMinutos: 5, presencaPercentual: 50 };

  it("exige os dois critérios juntos", () => {
    const duracao = 60 * 60;
    // 10 min passa no absoluto mas é 17% de uma hora.
    assert.equal(atingiuPresenca(10 * 60, duracao, regra), false);
    assert.equal(atingiuPresenca(31 * 60, duracao, regra), true);
  });

  it("só o percentual deixaria passar quase nada numa call curta", () => {
    const so = { presencaMinutos: 0, presencaPercentual: 50 };
    assert.equal(atingiuPresenca(3 * 60, 5 * 60, so), true, "3 de 5 min = 60%");
    assert.equal(atingiuPresenca(3 * 60, 5 * 60, regra), false, "mas não chega aos 5 min");
  });

  it("percentual zero desliga o critério relativo", () => {
    assert.equal(atingiuPresenca(6 * 60, 10 * 60 * 60, { presencaMinutos: 5, presencaPercentual: 0 }), true);
  });

  it("zero segundo nunca é presença", () => {
    assert.equal(atingiuPresenca(0, 0, { presencaMinutos: 0, presencaPercentual: 0 }), false);
  });
});

describe("veredicto da reunião", () => {
  const regra = { presencaMinutos: 5, presencaPercentual: 0 };
  const duracao = 60 * 60;

  it("SEM EVENTO É SEM DADOS, nunca no-show", () => {
    // O defeito exato do CRM de referência: sem webhook configurado, mil
    // participações viraram "não compareceu" e sumiram do relatório.
    assert.deepEqual(veredicto([], false, duracao, regra), { situacao: "sem_dados" });
  });

  it("sala com evento e sem o lead é no-show de verdade", () => {
    const so_vendedor = consolidar([entrou("u_1", 0), saiu("u_1", 30)], null);
    assert.deepEqual(veredicto(so_vendedor, true, duracao, regra), { situacao: "nao_compareceu" });
  });

  it("lead que ficou o bastante participou", () => {
    const p = consolidar([entrou("l_1", 0), saiu("l_1", 30)], null);
    const r = veredicto(p, true, duracao, regra);
    assert.equal(r.situacao, "participou");
  });

  it("lead que entrou e saiu em um minuto não participou", () => {
    const p = consolidar([entrou("l_1", 0), saiu("l_1", 1)], null);
    assert.equal(veredicto(p, true, duracao, regra).situacao, "nao_compareceu");
  });

  it("soma os aparelhos do mesmo lead", () => {
    // Entrou pelo celular e pelo notebook: identidades diferentes, uma pessoa.
    const p = consolidar(
      [entrou("l_1", 0), saiu("l_1", 3), entrou("l_1_b", 3), saiu("l_1_b", 6)],
      null,
    );
    assert.equal(veredicto(p, true, duracao, regra).situacao, "participou");
  });
});
