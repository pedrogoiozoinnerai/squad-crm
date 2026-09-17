import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  contarCriticos,
  lerBlocos,
  lerErros,
  lerScorecard,
  lerTextos,
  contarProibidas,
  contratoDeSaida,
  ERROS_VISIVEIS,
  errosVisiveis,
  lerAnalise,
  montarPrompt,
  problemaNaRubrica,
  type ErroDaCall,
} from "../src/lib/analise";

/**
 * O contrato da auditoria.
 *
 * O erro que estes casos existem para não repetir está documentado no CRM de
 * referência: prompt de 13.605 caracteres pedindo dezenas de campos, schema de
 * saída aceitando cinco. O modelo produz a análise inteira, alguém paga por
 * ela, e a maior parte é descartada em silêncio.
 */

const MINIMA = { resumo: "A call aconteceu.", veredicto: "BOA" };

const erro = (p: Partial<ErroDaCall>): ErroDaCall => ({
  bloco: null,
  gravidade: "MEDIO",
  oQueAconteceu: "algo",
  citacao: null,
  oQuePlaybookManda: null,
  emSegundos: null,
  ...p,
});

describe("ler a resposta do modelo", () => {
  it("o mínimo basta — o resto tem padrão", () => {
    const r = lerAnalise(MINIMA);
    assert.ok(r.ok, r.ok ? "" : r.problema);
    assert.deepEqual(r.analise.erros, []);
    assert.deepEqual(r.analise.roleplayFoco, []);
    assert.equal(r.analise.notaGeral, null);
  });

  it("nunca lança, mesmo com lixo", () => {
    // Quando este código roda, o áudio já foi transcrito e o modelo já foi
    // pago. Derrubar o trabalho por um campo a menos joga fora o caro para
    // punir o barato.
    for (const lixo of [null, "texto", 42, [], { resumo: 1 }]) {
      const r = lerAnalise(lixo);
      assert.equal(r.ok, false, `${JSON.stringify(lixo)} passou`);
    }
  });

  it("diz ONDE errou, não só que errou", () => {
    const r = lerAnalise({ ...MINIMA, aderenciaPct: 180 });
    assert.equal(r.ok, false);
    assert.match(r.ok ? "" : r.problema, /aderenciaPct/);
  });

  it("veredicto fora da lista não vira texto livre", () => {
    // A coluna é indexada e alimenta "quem está de freestyle esta semana?".
    // Um valor solto ali torna a pergunta impossível de fazer.
    assert.equal(lerAnalise({ ...MINIMA, veredicto: "mais ou menos" }).ok, false);
  });
});

describe("sem citação não há acusação", () => {
  it("erro sem citação NÃO é desenhado", () => {
    // O que está sendo dito é que uma pessoa conduziu mal uma conversa, e isso
    // é lido pelo gestor dela. Um apontamento que o modelo não consegue
    // ancorar numa frase literal é exatamente o que não se pode mostrar.
    const lista = [
      erro({ gravidade: "CRITICO", oQueAconteceu: "não fez a pergunta de dor" }),
      erro({ gravidade: "MEDIO", citacao: "então é isso, valeu" }),
    ];
    const vistos = errosVisiveis(lista);
    assert.equal(vistos.length, 1);
    assert.equal(vistos[0].citacao, "então é isso, valeu");
  });

  it("citação só de espaço também não conta", () => {
    assert.deepEqual(errosVisiveis([erro({ citacao: "   " })]), []);
  });

  it("os críticos vêm primeiro", () => {
    const lista = [
      erro({ gravidade: "LEVE", citacao: "a" }),
      erro({ gravidade: "CRITICO", citacao: "b" }),
      erro({ gravidade: "MEDIO", citacao: "c" }),
    ];
    assert.deepEqual(errosVisiveis(lista).map((e) => e.citacao), ["b", "c", "a"]);
  });

  it("no máximo três na tela", () => {
    // Onze erros é um paredão, e um paredão faz o closer parar de abrir a
    // página. O resto fica no scorecard, atrás do `<details>`.
    const lista = Array.from({ length: 11 }, (_, i) => erro({ citacao: `f${i}` }));
    assert.equal(errosVisiveis(lista).length, ERROS_VISIVEIS);
  });

  it("mas a CONTAGEM de críticos inclui os sem citação", () => {
    // Filtrar a tela não pode falsear o número: a coluna diz quantos houve,
    // não quantos couberam.
    const lista = [
      erro({ gravidade: "CRITICO" }),
      erro({ gravidade: "CRITICO", citacao: "x" }),
    ];
    assert.equal(errosVisiveis(lista).length, 1);
    assert.equal(contarCriticos(lista), 2);
  });
});

describe("as palavras proibidas", () => {
  it("somam ocorrências, não termos", () => {
    const r = lerAnalise({
      ...MINIMA,
      vocabulario: [
        { termo: "desconto", tipo: "PROIBIDO", ocorrencias: 4 },
        { termo: "garantia", tipo: "PROIBIDO", ocorrencias: 2 },
        { termo: "investimento", tipo: "RECOMENDADO", ocorrencias: 9 },
      ],
    });
    assert.ok(r.ok);
    assert.equal(contarProibidas(r.analise.vocabulario), 6);
  });
});

describe("o operador não alcança o formato", () => {
  it("o contrato sai do schema, não de texto escrito à mão", () => {
    const contrato = contratoDeSaida();
    // Se um campo entrar no schema e não aparecer aqui, é porque o prompt
    // deixou de pedir o que o banco guarda — que é exatamente o erro da
    // referência, invertido.
    for (const campo of ["resumo", "veredicto", "blocos", "erros", "vocabulario", "roleplayFoco"]) {
      assert.match(contrato, new RegExp(`"${campo}"`), `o contrato não pede ${campo}`);
    }
  });

  it("recusa rubrica que tenta mandar no formato", () => {
    const tentativa =
      "Julgue a call contra o playbook comercial do Squad, bloco a bloco, e responda em markdown com uma tabela por bloco.";
    assert.match(problemaNaRubrica(tentativa)?.motivo ?? "", /formato/i);
  });

  it("recusa rubrica curta demais para julgar alguma coisa", () => {
    assert.ok(problemaNaRubrica("seja rigoroso"));
  });

  it("aceita uma régua de verdade", () => {
    const boa =
      "Você audita calls de venda do Squad contra o playbook. Percorra os blocos na ordem: " +
      "abertura, diagnóstico, apresentação, oferta e fechamento. Aponte o que faltou e cite a frase.";
    assert.equal(problemaNaRubrica(boa), null);
  });

  it("o prompt é a rubrica MAIS o contrato — nesta ordem", () => {
    const p = montarPrompt("REGRA DO SQUAD AQUI COM TAMANHO SUFICIENTE PARA VALER", "olá mundo");
    assert.ok(p.indexOf("REGRA DO SQUAD") < p.indexOf("JSON Schema"));
    assert.ok(p.indexOf("JSON Schema") < p.indexOf("olá mundo"));
  });
});

describe("os campos jsonb de volta do banco", () => {
  it("lê o que este mesmo schema gravou", () => {
    const r = lerAnalise({
      ...MINIMA,
      blocos: [{ nome: "Abertura", status: "OK", minutos: 5 }],
      erros: [{ gravidade: "CRITICO", oQueAconteceu: "x", citacao: "y" }],
      insights: ["ligar para a Ana"],
    });
    assert.ok(r.ok);
    const ida = JSON.parse(JSON.stringify(r.analise));
    assert.equal(lerBlocos(ida.blocos)[0].nome, "Abertura");
    assert.equal(lerErros(ida.erros)[0].citacao, "y");
    assert.deepEqual(lerTextos(ida.insights), ["ligar para a Ana"]);
  });

  it("forma desconhecida vira lista vazia, não exceção", () => {
    // O que está no jsonb foi gravado por uma versão anterior deste schema.
    // Um campo que mudou de nome há três meses não pode derrubar a página
    // inteira de uma call — levando junto a presença, que não tem nada a ver
    // com a análise.
    for (const lixo of [null, undefined, "texto", 42, {}, [{ nada: 1 }]]) {
      assert.deepEqual(lerBlocos(lixo), [], `${JSON.stringify(lixo)} passou em blocos`);
      assert.deepEqual(lerErros(lixo), [], `${JSON.stringify(lixo)} passou em erros`);
      assert.deepEqual(lerScorecard(lixo), []);
    }
  });

  it("um item torto NÃO leva os certos junto", () => {
    // É uma lista inteira ou nada: aproveitar metade dos blocos daria um
    // trilho com buraco no meio, que mente sobre a call em vez de admitir que
    // não sabe.
    assert.deepEqual(lerBlocos([{ nome: "Abertura", status: "INVENTADO" }]), []);
  });
});
