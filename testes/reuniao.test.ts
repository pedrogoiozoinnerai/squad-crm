import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { instanteDeCampoLocal } from "../src/lib/dates";
import {
  DURACAO_MAX,
  DURACAO_MIN,
  duracaoValida,
  fimDaReuniao,
  LOTACAO_PADRAO,
  lotacaoValida,
  sobrepoe,
  tipoDeReuniao,
} from "../src/lib/reuniao";

const em = (valor: string) => instanteDeCampoLocal(valor)!;

describe("duração da reunião", () => {
  it("aceita os múltiplos de 5 dentro da faixa", () => {
    assert.equal(duracaoValida("30"), 30);
    assert.equal(duracaoValida("45"), 45);
    assert.equal(duracaoValida(String(DURACAO_MIN)), DURACAO_MIN);
    assert.equal(duracaoValida(String(DURACAO_MAX)), DURACAO_MAX);
  });

  it("recusa em vez de virar 30 em silêncio", () => {
    // A lista fechada anterior ([30,45,60,90]) transformava qualquer outro
    // valor em 30 minutos sem avisar: quem marcasse 120 saía com meia hora e
    // só descobria na hora da call.
    assert.equal(duracaoValida("120"), 120, "120 agora é válido");
    assert.equal(duracaoValida("7"), null, "não é múltiplo de 5");
    assert.equal(duracaoValida("0"), null);
    assert.equal(duracaoValida(String(DURACAO_MAX + 5)), null);
    assert.equal(duracaoValida("abc"), null);
    assert.equal(duracaoValida("30.5"), null);
    assert.equal(duracaoValida("Infinity"), null);
    assert.equal(duracaoValida(null), null);
  });
});

describe("tipo da reunião", () => {
  it("só GROUP é grupo; o resto é individual", () => {
    assert.equal(tipoDeReuniao("GROUP"), "GROUP");
    assert.equal(tipoDeReuniao("ONE_ON_ONE"), "ONE_ON_ONE");
    assert.equal(tipoDeReuniao("qualquer coisa"), "ONE_ON_ONE");
    assert.equal(tipoDeReuniao(null), "ONE_ON_ONE");
  });
});

describe("lotação", () => {
  it("é nula em 1:1, como o schema declara", () => {
    assert.equal(lotacaoValida("20", "ONE_ON_ONE"), null);
    assert.equal(lotacaoValida(null, "ONE_ON_ONE"), null);
  });

  it("NUNCA é nula em grupo — era o defeito", () => {
    // `scheduleMeeting` jamais gravava capacity. Com lotação nula a sessão
    // some da API de disponibilidade, que filtra `capacity: { not: null }` —
    // e some sem erro nenhum, aparecendo normal na agenda do vendedor.
    assert.equal(lotacaoValida(null, "GROUP"), LOTACAO_PADRAO);
    assert.equal(lotacaoValida("", "GROUP"), LOTACAO_PADRAO);
    assert.equal(lotacaoValida("35", "GROUP"), 35);
  });

  it("recusa fora da faixa", () => {
    assert.equal(lotacaoValida("0", "GROUP"), "invalida");
    assert.equal(lotacaoValida("501", "GROUP"), "invalida");
    assert.equal(lotacaoValida("abc", "GROUP"), "invalida");
    assert.equal(lotacaoValida("2.5", "GROUP"), "invalida");
  });
});

describe("sobreposição de horário", () => {
  const janela = (de: string, ate: string) => ({ inicio: em(de), fim: em(ate) });

  it("reconhece o encaixe parcial nos dois sentidos", () => {
    const a = janela("2026-10-06T14:00", "2026-10-06T15:00");
    assert.equal(sobrepoe(a, janela("2026-10-06T14:30", "2026-10-06T15:30")), true);
    assert.equal(sobrepoe(a, janela("2026-10-06T13:30", "2026-10-06T14:30")), true);
  });

  it("reconhece uma dentro da outra", () => {
    const a = janela("2026-10-06T14:00", "2026-10-06T16:00");
    assert.equal(sobrepoe(a, janela("2026-10-06T14:30", "2026-10-06T15:00")), true);
    assert.equal(sobrepoe(janela("2026-10-06T14:30", "2026-10-06T15:00"), a), true);
  });

  it("extremos que se TOCAM não se sobrepõem", () => {
    // 14:00–15:00 e 15:00–16:00 são consecutivas, não conflitantes. Avisar de
    // conflito aqui faria o vendedor ignorar o aviso de vez.
    const a = janela("2026-10-06T14:00", "2026-10-06T15:00");
    assert.equal(sobrepoe(a, janela("2026-10-06T15:00", "2026-10-06T16:00")), false);
    assert.equal(sobrepoe(janela("2026-10-06T13:00", "2026-10-06T14:00"), a), false);
  });

  it("dias diferentes nunca se sobrepõem", () => {
    assert.equal(
      sobrepoe(
        janela("2026-10-06T14:00", "2026-10-06T15:00"),
        janela("2026-10-07T14:00", "2026-10-07T15:00"),
      ),
      false,
    );
  });
});

describe("fim da reunião", () => {
  it("soma a duração ao início", () => {
    assert.equal(
      fimDaReuniao(em("2026-10-06T14:00"), 45).toISOString(),
      em("2026-10-06T14:45").toISOString(),
    );
  });

  it("atravessa a meia-noite sem quebrar", () => {
    assert.equal(
      fimDaReuniao(em("2026-10-06T23:30"), 60).toISOString(),
      em("2026-10-07T00:30").toISOString(),
    );
  });
});
