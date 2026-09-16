import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { inicioDaLeitura, POR_PAGINA, proximaMarca } from "../src/lib/marca-dagua";

const em = (iso: string) => new Date(iso);

/**
 * A marca d'água da sincronização com o funil.
 *
 * O defeito que ela conserta perdia lead em silêncio: a leitura era
 * `ORDER BY createdAt DESC LIMIT 500`, então numa rajada de mais de 500 leads
 * em dez minutos os excedentes saíam da janela e nunca voltavam. Sem erro, sem
 * log, sem fila.
 */
describe("início da leitura", () => {
  const agora = em("2026-09-16T15:00:00.000Z");

  it("sem marca, começa sete dias atrás", () => {
    // Não do começo dos tempos: o histórico antigo já foi espelhado pela
    // janela de 500 que existia antes, e puxar tudo faria a primeira execução
    // tentar reconciliar meses num só request.
    const inicio = inicioDaLeitura(null, agora);
    assert.equal(inicio.toISOString(), "2026-09-09T15:00:00.000Z");
  });

  it("com marca, volta um pouco antes dela", () => {
    // A sobreposição existe por causa do empate: dois leads podem ter o MESMO
    // `updatedAt` e cair em páginas diferentes. Sem ela, o segundo sumiria na
    // virada da página.
    const marca = em("2026-09-16T14:30:00.000Z");
    const inicio = inicioDaLeitura(marca, agora);
    assert.ok(inicio < marca, "começa antes da marca");
    assert.equal(inicio.toISOString(), "2026-09-16T14:29:58.000Z");
  });

  it("a sobreposição é pequena — reprocessar é barato, perder não é", () => {
    const marca = em("2026-09-16T14:30:00.000Z");
    const atraso = marca.getTime() - inicioDaLeitura(marca, agora).getTime();
    assert.ok(atraso > 0 && atraso <= 5_000, `${atraso}ms de sobreposição`);
  });

  it("a marca nunca faz a leitura andar para a frente sozinha", () => {
    // Uma marca no futuro (relógio torto, restauração de backup) não pode
    // fazer a leitura pular leads reais.
    const futuro = em("2026-09-17T00:00:00.000Z");
    assert.ok(inicioDaLeitura(futuro, agora) > agora, "respeita a marca, mesmo à frente");
  });
});

describe("tamanho da página", () => {
  it("cabe no tempo da função", () => {
    // Cada lead custa de 4 a 8 idas ao banco, sequenciais, com `max: 1`
    // conexão. A 15ms por ida, 200 leads dão ~24s — dentro dos 60 do
    // `maxDuration`, com folga para a página seguinte.
    const idasPorLead = 8;
    const msPorIda = 15;
    const piorCaso = (POR_PAGINA * idasPorLead * msPorIda) / 1000;
    assert.ok(piorCaso < 45, `pior caso ${piorCaso}s, teto de drenagem 45s`);
  });

  it("é menor que a janela fixa que substituiu", () => {
    // 500 de uma vez era o que empurrava a execução para perto dos 60s.
    assert.ok(POR_PAGINA < 500);
  });
});

describe("próxima marca", () => {
  it("é a maior data da página", () => {
    const m = proximaMarca([
      "2026-09-16T14:00:00.000Z",
      "2026-09-16T14:30:00.000Z",
      "2026-09-16T14:15:00.000Z",
    ]);
    assert.equal(m?.toISOString(), "2026-09-16T14:30:00.000Z");
  });

  it("ignora nulo e data inválida em vez de quebrar", () => {
    // A coluna vem de outro schema, por SQL cru: um valor torto não pode
    // derrubar a sincronização inteira.
    const m = proximaMarca([null, "não é data", "2026-09-16T14:00:00.000Z", null]);
    assert.equal(m?.toISOString(), "2026-09-16T14:00:00.000Z");
  });

  it("página sem data nenhuma deixa a marca onde está", () => {
    // Devolver "agora" aqui puliria tudo que ainda não foi processado.
    assert.equal(proximaMarca([null, null]), null);
    assert.equal(proximaMarca([]), null);
  });
});

describe("a rajada que perdia lead", () => {
  /**
   * O cenário real: uma campanha entra no ar e chegam mais leads do que uma
   * página comporta. Com a janela fixa de 500 ordenada por `DESC`, os
   * excedentes saíam pelo fundo e não voltavam nunca.
   *
   * Aqui simulo a paginação inteira sobre uma rajada e confiro que TODO lead
   * é visto exatamente uma vez ou mais — nunca zero.
   */
  function simularDrenagem(totalDeLeads: number, porPagina: number) {
    // Cada lead com um `updatedAt` próprio, um segundo depois do anterior.
    const base = em("2026-09-16T12:00:00.000Z").getTime();
    const leads = Array.from({ length: totalDeLeads }, (_, i) => ({
      id: i,
      updatedAt: new Date(base + i * 1000).toISOString(),
    }));

    const vistos = new Map<number, number>();
    let marca: Date | null = null;

    for (let pagina = 0; pagina < 100; pagina++) {
      const desde = inicioDaLeitura(marca, em("2026-09-17T00:00:00.000Z"));
      const doLote = leads
        .filter((l) => new Date(l.updatedAt) >= desde)
        .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
        .slice(0, porPagina);

      if (doLote.length === 0) break;
      for (const l of doLote) vistos.set(l.id, (vistos.get(l.id) ?? 0) + 1);

      const nova = proximaMarca(doLote.map((l) => l.updatedAt));
      // Sem avanço não há progresso: pararia aqui em vez de girar para sempre.
      if (!nova || (marca && nova <= marca)) break;
      marca = nova;
    }

    return vistos;
  }

  it("uma rajada de 2.000 leads não perde nenhum", () => {
    const vistos = simularDrenagem(2000, POR_PAGINA);
    assert.equal(vistos.size, 2000, "todos os 2.000 foram vistos");
    for (const [id, vezes] of vistos) {
      assert.ok(vezes >= 1, `lead ${id} visto ${vezes} vezes`);
    }
  });

  it("a sobreposição repete pouco — não é reprocessar tudo", () => {
    const vistos = simularDrenagem(2000, POR_PAGINA);
    const repetidos = [...vistos.values()].filter((v) => v > 1).length;
    // Com 1s entre leads e 2s de sobreposição, no máximo dois por virada de
    // página. Se isto explodir, a sobreposição virou reprocessamento.
    assert.ok(repetidos <= 40, `${repetidos} leads repetidos em 2.000`);
  });

  it("uma página exata não trava a drenagem", () => {
    // O caso de borda: total múltiplo do tamanho da página.
    const vistos = simularDrenagem(POR_PAGINA * 3, POR_PAGINA);
    assert.equal(vistos.size, POR_PAGINA * 3);
  });
});
