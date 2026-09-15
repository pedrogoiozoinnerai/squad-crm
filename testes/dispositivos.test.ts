import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { lerFalha } from "../src/components/sala/dispositivos";

/**
 * O navegador fala em `NotAllowedError`; o vendedor precisa saber onde clicar.
 * Toda mensagem tem que terminar numa ação — é a diferença entre "deu erro" e
 * "clique no cadeado".
 */
describe("falhas de câmera e microfone", () => {
  it("permissão negada aponta o cadeado", () => {
    const f = lerFalha({ name: "NotAllowedError" }, "microfone");
    assert.match(f.mensagem, /cadeado na barra de endereço/);
    assert.equal(f.podeTentarDeNovo, true);
  });

  it("dispositivo ocupado por outro programa é o caso mais comum", () => {
    // Zoom ou Meet abertos atrás seguram a câmera e o navegador só diz
    // "NotReadableError".
    const f = lerFalha({ name: "NotReadableError" }, "câmera");
    assert.match(f.mensagem, /Feche as outras chamadas/);
    assert.equal(f.podeTentarDeNovo, true);
  });

  it("sem aparelho não adianta tentar de novo — e oferece entrar assim mesmo", () => {
    const f = lerFalha({ name: "NotFoundError" }, "câmera");
    assert.equal(f.podeTentarDeNovo, false);
    assert.match(f.mensagem, /ainda pode entrar/);
  });

  it("erro desconhecido não vira mensagem vazia", () => {
    for (const erro of [null, undefined, {}, new Error("x")]) {
      const f = lerFalha(erro, "câmera e microfone");
      assert.ok(f.mensagem.length > 20, `mensagem fraca para ${JSON.stringify(erro)}`);
    }
  });

  it("concorda em gênero com o que foi pedido", () => {
    assert.match(lerFalha({ name: "NotAllowedError" }, "câmera").mensagem, /à câmera/);
    assert.match(lerFalha({ name: "NotAllowedError" }, "microfone").mensagem, /ao microfone/);
    assert.match(
      lerFalha({ name: "NotAllowedError" }, "câmera e microfone").mensagem,
      /à câmera e ao microfone/,
    );
  });
});
