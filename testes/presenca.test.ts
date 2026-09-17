import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  atingiuPresenca,
  consolidar,
  REGRA_PADRAO,
  veredicto,
  type EventoBruto,
} from "../src/lib/presenca";

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

describe("o gravador não é gente", () => {
  it("fica de fora da presença", () => {
    // A gravação entra na sala como participante: o LiveKit sobe um navegador
    // sem tela e ele dá `join` como qualquer um. Contá-lo inflaria a presença
    // — e numa sessão de dois inscritos ele sozinho dobraria a taxa.
    const presencas = consolidar(
      [
        entrou("EG_4kPz9", 0, "Egress"),
        entrou("l_1", 2),
        saiu("l_1", 40),
        saiu("EG_4kPz9", 41),
      ],
      null,
    );
    assert.deepEqual(presencas.map((p) => p.identity), ["l_1"]);
  });

  it("e ele sozinho não faz a sala parecer cheia", () => {
    // O caso feio: ninguém apareceu, mas a gravação subiu. Sem o filtro, a
    // reunião teria "1 presente" e o closer só descobriria abrindo.
    assert.deepEqual(consolidar([entrou("EG_x", 0), saiu("EG_x", 60)], null), []);
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

describe("uma fonte só para a regra de presença", () => {
  it("o padrão do código bate com o @default do schema", () => {
    // Três cópias divergentes desta regra já conviveram no projeto: a coluna
    // no banco, um `MINUTOS_MINIMOS = 5` na tela e um `>= 300` no seed.
    // Este teste é o que impede a quarta.
    const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");

    const doSchema = (campo: string) => {
      const achado = schema.match(new RegExp(`${campo}\\s+Int\\s+@default\\((\\d+)\\)`));
      assert.ok(achado, `${campo} não encontrado no schema`);
      return Number(achado[1]);
    };

    assert.equal(doSchema("presencaMinutos"), REGRA_PADRAO.presencaMinutos);
    assert.equal(doSchema("presencaPercentual"), REGRA_PADRAO.presencaPercentual);
  });

  it("nenhum componente declara a regra por conta própria", () => {
    // Uma constante nova na tela voltaria a divergir em silêncio.
    //
    // Varre a pasta em vez de listar nomes: a lista fixa envelhece calada. Ela
    // já tinha envelhecido — apontava para um `SessionDrawer.tsx` que virou
    // página, e o teste quebrou por arquivo ausente em vez de por regra
    // duplicada. Um componente novo entra coberto sem ninguém lembrar dele.
    const pasta = new URL("../src/components/sessions/", import.meta.url);
    const arquivos = readdirSync(pasta).filter((a) => a.endsWith(".tsx"));
    assert.ok(arquivos.length > 0, "a pasta de componentes de sessão sumiu");

    for (const arquivo of arquivos) {
      const fonte = readFileSync(new URL(arquivo, pasta), "utf8");
      assert.doesNotMatch(fonte, /MINUTOS_MINIMOS/, `${arquivo} voltou a declarar a regra`);
    }
  });
});

describe("quantas vezes entrou", () => {
  const em = (min: number) => new Date(Date.UTC(2026, 8, 15, 14, min, 0));
  const ev = (type: string, min: number, identity: string | null = "l_1") => ({
    type,
    at: em(min),
    identity,
    name: "Ana",
  });

  it("uma entrada e uma saída contam uma", () => {
    const [p] = consolidar([ev("participant_joined", 0), ev("participant_left", 10)], null);
    assert.equal(p.joinCount, 1);
    assert.equal(p.seconds, 600);
  });

  it("queda no meio conta duas, e o tempo é a soma", () => {
    // É o número que explica um tempo baixo: quinze minutos em duas entradas
    // é conexão ruim, não desinteresse.
    const [p] = consolidar(
      [
        ev("participant_joined", 0),
        ev("participant_left", 5),
        ev("participant_joined", 7),
        ev("participant_left", 17),
      ],
      null,
    );
    assert.equal(p.joinCount, 2);
    assert.equal(p.seconds, 900, "5 min + 10 min");
  });

  it("entrada repetida sem saída não infla o tempo, mas conta a entrada", () => {
    const [p] = consolidar(
      [ev("participant_joined", 0), ev("participant_joined", 3), ev("participant_left", 10)],
      null,
    );
    assert.equal(p.joinCount, 2, "o LiveKit disse que entrou duas vezes");
    assert.equal(p.seconds, 600, "mas o intervalo medido é um só");
  });

  it("quem nunca saiu fecha no fim da sala", () => {
    const [p] = consolidar([ev("participant_joined", 0)], em(20));
    assert.equal(p.joinCount, 1);
    assert.equal(p.seconds, 1200);
    assert.equal(p.leftAt?.getTime(), em(20).getTime());
  });
});
