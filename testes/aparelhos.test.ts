import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { aparelhosNaTela, type Aparelho } from "../src/lib/aparelhos";

/**
 * O celular mostrava seis câmeras.
 *
 * `enumerateDevices` num iPhone devolve frontal, traseira, grande-angular,
 * teleobjetiva e as "câmeras duplas" — tudo existe no hardware e nada disso é
 * uma escolha que alguém queira fazer no meio de uma apresentação. E o mesmo
 * microfone vinha três vezes, porque `default` e `communications` são apelidos
 * para um aparelho que já está na lista.
 */

const d = (deviceId: string, label: string, kind = "videoinput"): Aparelho => ({
  deviceId,
  label,
  kind,
});

/// O que um iPhone devolve de verdade.
const IPHONE: Aparelho[] = [
  d("f1", "Câmera frontal"),
  d("b1", "Câmera traseira"),
  d("b2", "Câmera grande-angular traseira"),
  d("b3", "Câmera teleobjetiva traseira"),
  d("b4", "Câmera dupla traseira"),
  d("b5", "Câmera tripla traseira"),
];

describe("câmeras no celular", () => {
  it("seis viram duas: frontal e traseira", () => {
    const lista = aparelhosNaTela(IPHONE, "videoinput", true);
    assert.equal(lista.length, 2);
    assert.deepEqual(lista.map((a) => a.nome), ["Câmera frontal", "Câmera traseira"]);
  });

  it("e apontam para os aparelhos certos", () => {
    const lista = aparelhosNaTela(IPHONE, "videoinput", true);
    assert.equal(lista[0].deviceId, "f1");
    assert.equal(lista[1].deviceId, "b1");
  });

  it("as lentes extras ficam de fora", () => {
    const ids = aparelhosNaTela(IPHONE, "videoinput", true).map((a) => a.deviceId);
    for (const extra of ["b2", "b3", "b4", "b5"]) {
      assert.ok(!ids.includes(extra), `${extra} não devia aparecer`);
    }
  });

  it("rótulo em inglês também é reconhecido", () => {
    const androide = [d("f", "Front Camera"), d("b", "Back Camera"), d("w", "Ultra Wide Camera")];
    const lista = aparelhosNaTela(androide, "videoinput", true);
    assert.deepEqual(lista.map((a) => a.nome), ["Câmera frontal", "Câmera traseira"]);
  });

  it("nome irreconhecível devolve a lista crua — melhor que lista vazia", () => {
    // Aparelho com nome esquisito existe, e ficar sem nenhuma opção é pior que
    // mostrar duas com nome feio.
    const estranho = [d("x", "USB Video Device"), d("y", "Capture Card")];
    const lista = aparelhosNaTela(estranho, "videoinput", true);
    assert.equal(lista.length, 2);
  });
});

describe("no computador a lista fica inteira", () => {
  it("cada webcam é uma escolha de verdade", () => {
    const pc = [d("a", "Integrated Webcam"), d("b", "Logitech C920"), d("c", "OBS Virtual Camera")];
    assert.equal(aparelhosNaTela(pc, "videoinput", false).length, 3);
  });
});

describe("microfone repetido", () => {
  const MICS: Aparelho[] = [
    d("default", "Microfone do MacBook Pro", "audioinput"),
    d("communications", "Microfone do MacBook Pro", "audioinput"),
    d("abc123", "Microfone do MacBook Pro", "audioinput"),
    d("ext", "AirPods Pro", "audioinput"),
  ];

  it("o mesmo aparelho não aparece três vezes", () => {
    const lista = aparelhosNaTela(MICS, "audioinput");
    assert.equal(lista.length, 2);
    assert.deepEqual(lista.map((a) => a.nome), ["Microfone do MacBook Pro", "AirPods Pro"]);
  });

  it("o apelido do sistema sai, o aparelho real fica", () => {
    const lista = aparelhosNaTela(MICS, "audioinput");
    assert.ok(!lista.some((a) => a.deviceId === "default"));
    assert.ok(lista.some((a) => a.deviceId === "abc123"));
  });

  it("mas se só existe o apelido, ele fica — senão a lista some", () => {
    const so = [d("default", "Microfone padrão", "audioinput")];
    assert.equal(aparelhosNaTela(so, "audioinput").length, 1);
  });
});

describe("rótulos sujos", () => {
  it("tira o identificador de hardware que o Chrome pendura", () => {
    const lista = aparelhosNaTela([d("a", "HD Pro Webcam C920 (046d:082d)")], "videoinput");
    assert.equal(lista[0].nome, "HD Pro Webcam C920");
  });

  it("sem rótulo, avisa em vez de mostrar vazio", () => {
    // Acontece antes de a pessoa conceder permissão: o navegador esconde os
    // nomes até alguém liberar câmera ou microfone uma vez.
    const lista = aparelhosNaTela([d("a", "")], "videoinput");
    assert.equal(lista[0].nome, "Aparelho sem nome");
  });

  it("aparelho sem id é descartado", () => {
    assert.equal(aparelhosNaTela([d("", "Fantasma")], "videoinput").length, 0);
  });

  it("filtra por tipo", () => {
    const mistura = [d("v", "Webcam", "videoinput"), d("a", "Mic", "audioinput")];
    assert.equal(aparelhosNaTela(mistura, "audioinput").length, 1);
    assert.equal(aparelhosNaTela(mistura, "audioinput")[0].nome, "Mic");
  });
});
