import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  carimboDoTrecho,
  lerRespostaDeepgram,
  lerSegmentos,
  medirFalantes,
  MODELO_PADRAO,
  parametrosDaDeepgram,
  provavelCondutor,
} from "../src/lib/transcricao";

/**
 * A resposta da Deepgram.
 *
 * Testada contra um JSON de exemplo daqui mesmo, e não contra a API: quando
 * este código roda, o áudio de uma hora JÁ foi transcrito e JÁ foi pago. Uma
 * chave com outro nome do lado deles não pode transformar isso em zero.
 */

/** A forma que a Deepgram entrega com `diarize` e `utterances` ligados. */
const RESPOSTA = {
  metadata: {
    request_id: "3f8a-1",
    duration: 3612.4,
    models: ["nova-3"],
    model_info: { "abc-123": { name: "nova-3", version: "2026-01-01" } },
  },
  results: {
    channels: [
      {
        detected_language: "pt-BR",
        alternatives: [
          {
            transcript: "bom dia a todos vamos começar tudo bem por aqui",
            paragraphs: { transcript: "Bom dia a todos, vamos começar.\n\nTudo bem por aqui." },
          },
        ],
      },
    ],
    utterances: [
      { start: 0, end: 30, speaker: 0, transcript: "Bom dia a todos, vamos começar." },
      { start: 30, end: 35, speaker: 1, transcript: "Tudo bem por aqui." },
      { start: 35, end: 95, speaker: 0, transcript: "Então o que a gente faz é o seguinte." },
    ],
  },
};

describe("ler a transcrição", () => {
  it("prefere o texto com parágrafos", () => {
    // Sem parágrafo, uma call de uma hora vira sessenta mil caracteres sem um
    // ponto de respiro — e nem o humano nem o modelo leem aquilo direito.
    const t = lerRespostaDeepgram(RESPOSTA);
    assert.equal(t?.texto, "Bom dia a todos, vamos começar.\n\nTudo bem por aqui.");
  });

  it("traz os trechos com tempo — é o que sincroniza com o player", () => {
    const t = lerRespostaDeepgram(RESPOSTA);
    assert.equal(t?.segmentos.length, 3);
    assert.deepEqual(t?.segmentos[1], {
      inicio: 30,
      fim: 35,
      falante: 1,
      texto: "Tudo bem por aqui.",
    });
  });

  it("guarda o id do pedido — é por ele que o callback reencontra o trabalho", () => {
    assert.equal(lerRespostaDeepgram(RESPOSTA)?.externoId, "3f8a-1");
  });

  it("lê duração, idioma e modelo", () => {
    const t = lerRespostaDeepgram(RESPOSTA);
    assert.equal(t?.duracaoSegundos, 3612.4);
    assert.equal(t?.idioma, "pt-BR");
    assert.equal(t?.modelo, "nova-3");
  });

  it("sem `paragraphs`, junta as falas", () => {
    const sem = {
      ...RESPOSTA,
      results: {
        ...RESPOSTA.results,
        channels: [{ alternatives: [{ transcript: "tudo junto sem pontuação" }] }],
      },
    };
    const t = lerRespostaDeepgram(sem);
    assert.match(t?.texto ?? "", /Bom dia a todos[\s\S]*\n\n[\s\S]*Tudo bem/);
  });

  it("sem falas nem parágrafos, o texto corrido serve", () => {
    const so = {
      metadata: { request_id: "x" },
      results: { channels: [{ alternatives: [{ transcript: "só isto" }] }] },
    };
    assert.equal(lerRespostaDeepgram(so)?.texto, "só isto");
  });

  it("uma resposta sem texto nenhum é `null`, não uma transcrição vazia", () => {
    // Devolver vazio faria o passo seguinte mandar uma call em branco para a
    // análise — que responderia alguma coisa, e essa alguma coisa iria para a
    // tela do closer como se fosse a call dele.
    assert.equal(lerRespostaDeepgram({ metadata: {}, results: { channels: [] } }), null);
    assert.equal(lerRespostaDeepgram({}), null);
    assert.equal(lerRespostaDeepgram(null), null);
    assert.equal(lerRespostaDeepgram("erro"), null);
  });

  it("campo que muda de nome do lado deles não derruba o resto", () => {
    const estranho = {
      metadata: { request_id: "x", duration: "não é número" },
      results: {
        channels: [{ alternatives: [{ paragraphs: { transcript: "o texto está aqui" } }] }],
        utterances: "mudou de forma",
      },
    };
    const t = lerRespostaDeepgram(estranho);
    assert.equal(t?.texto, "o texto está aqui");
    assert.equal(t?.duracaoSegundos, null);
    assert.deepEqual(t?.segmentos, []);
  });
});

describe("quem falou quanto", () => {
  it("soma por falante, do que mais falou para o que menos", () => {
    const m = medirFalantes(lerRespostaDeepgram(RESPOSTA)!.segmentos);
    assert.deepEqual(m, [
      { falante: 0, segundos: 90, trechos: 2 },
      { falante: 1, segundos: 5, trechos: 1 },
    ]);
  });

  it("numa coletiva, quem apresenta é o condutor", () => {
    assert.equal(provavelCondutor(medirFalantes(lerRespostaDeepgram(RESPOSTA)!.segmentos)), 0);
  });

  it("numa conversa equilibrada, NÃO chuta", () => {
    // Chutar aqui trocaria o vendedor pelo cliente na tela inteira — e a
    // auditoria passaria a julgar a fala do lead como se fosse a do closer.
    const equilibrada = [
      { inicio: 0, fim: 100, falante: 0, texto: "a" },
      { inicio: 100, fim: 190, falante: 1, texto: "b" },
    ];
    assert.equal(provavelCondutor(medirFalantes(equilibrada)), null);
  });

  it("sem diarização, ninguém", () => {
    assert.equal(provavelCondutor([]), null);
  });
});

describe("o pedido à Deepgram", () => {
  it("manda o callback — é o que tira a call de uma hora dos 60 s da função", () => {
    const p = new URLSearchParams(
      parametrosDaDeepgram({ callback: "https://crm.squad.com/api/deepgram/abc" }),
    );
    assert.equal(p.get("callback"), "https://crm.squad.com/api/deepgram/abc");
    assert.equal(p.get("model"), MODELO_PADRAO);
    assert.equal(p.get("language"), "pt-BR");
    assert.equal(p.get("diarize"), "true");
    assert.equal(p.get("utterances"), "true");
    assert.equal(p.get("paragraphs"), "true");
  });

  it("dá para trocar o modelo sem mexer no resto", () => {
    // Se `nova-3` não atender pt-BR no painel, a troca para `nova-2` é um
    // parâmetro — não uma edição no meio da rota.
    const p = new URLSearchParams(parametrosDaDeepgram({ callback: "x", modelo: "nova-2" }));
    assert.equal(p.get("model"), "nova-2");
  });
});

describe("os trechos de volta do banco", () => {
  it("lê o que este mesmo código gravou", () => {
    const ida = lerRespostaDeepgram(RESPOSTA)!.segmentos;
    assert.deepEqual(lerSegmentos(JSON.parse(JSON.stringify(ida))), ida);
  });

  it("jsonb de outra forma não derruba a página da call", () => {
    // `segmentos` é jsonb: o que está lá foi gravado por uma versão anterior
    // deste código, talvez com outro nome de campo. Um `undefined.toFixed()`
    // na renderização levaria a página inteira junto — inclusive a presença,
    // que não tem nada a ver com a transcrição.
    assert.deepEqual(lerSegmentos(null), []);
    assert.deepEqual(lerSegmentos({ trechos: [] }), []);
    assert.deepEqual(lerSegmentos([{ start: 0, end: 1, text: "forma antiga" }]), []);
  });

  it("aproveita o que der, descarta o resto", () => {
    const lidos = lerSegmentos([
      { inicio: 5, fim: 9, falante: 0, texto: "vale" },
      { inicio: 9, fim: 10, texto: "" },
      { inicio: "x", fim: null, falante: "?", texto: "sem números" },
    ]);
    assert.equal(lidos.length, 2);
    assert.deepEqual(lidos[1], { inicio: 0, fim: 0, falante: null, texto: "sem números" });
  });
});

describe("o carimbo do trecho", () => {
  it("minuto e segundo", () => {
    assert.equal(carimboDoTrecho(0), "0:00");
    assert.equal(carimboDoTrecho(65), "1:05");
    assert.equal(carimboDoTrecho(599), "9:59");
  });

  it("passa de uma hora sem virar 0:00", () => {
    // Mentoria de duas horas existe, e um carimbo que reinicia mandaria quem
    // clica para o começo do vídeo.
    assert.equal(carimboDoTrecho(3600), "1:00:00");
    assert.equal(carimboDoTrecho(3725), "1:02:05");
  });

  it("fração de segundo não vira decimal na tela", () => {
    assert.equal(carimboDoTrecho(12.87), "0:12");
  });

  it("negativo não existe", () => {
    assert.equal(carimboDoTrecho(-5), "0:00");
  });
});
