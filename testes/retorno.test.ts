import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { retornoConfere, tokenDoRetorno } from "../src/lib/retorno";

/**
 * A porta que ninguém assina.
 *
 * O LiveKit manda um JWT com o sha256 do corpo; a Deepgram manda o corpo e
 * pronto. Quem descobrir o endereço de retorno pode gravar o "que foi dito"
 * numa call de um cliente — então o segredo é o próprio endereço.
 */

const SEGREDO = "um-segredo-de-cron-bem-comprido";

describe("o token do retorno", () => {
  it("é o mesmo para o mesmo trabalho — dá para derivar de novo sem guardar", () => {
    assert.equal(tokenDoRetorno("job_1", SEGREDO), tokenDoRetorno("job_1", SEGREDO));
  });

  it("é diferente para cada trabalho", () => {
    // Senão um retorno válido de uma call abriria a porta de todas as outras.
    assert.notEqual(tokenDoRetorno("job_1", SEGREDO), tokenDoRetorno("job_2", SEGREDO));
  });

  it("muda com o segredo", () => {
    assert.notEqual(tokenDoRetorno("job_1", SEGREDO), tokenDoRetorno("job_1", "outro"));
  });

  it("não é o id disfarçado", () => {
    assert.doesNotMatch(tokenDoRetorno("job_1", SEGREDO), /job_1/);
  });

  it("confere o certo", () => {
    assert.equal(retornoConfere("job_1", tokenDoRetorno("job_1", SEGREDO), SEGREDO), true);
  });

  it("recusa o token de OUTRO trabalho", () => {
    assert.equal(retornoConfere("job_1", tokenDoRetorno("job_2", SEGREDO), SEGREDO), false);
  });

  it("recusa token vazio, e não estoura com ele", () => {
    assert.equal(retornoConfere("job_1", "", SEGREDO), false);
  });

  it("sem segredo nenhum, NADA passa", () => {
    // O caso perigoso: ambiente sem `CRON_SECRET` e a comparação de dois
    // vazios dando `true` abriria a rota para o mundo.
    assert.equal(retornoConfere("job_1", "", ""), false);
    assert.equal(retornoConfere("job_1", tokenDoRetorno("job_1", ""), ""), false);
  });

  it("token de tamanho diferente não estoura a comparação", () => {
    // `timingSafeEqual` LANÇA quando os buffers têm tamanhos diferentes — e um
    // erro não tratado numa rota pública vira 500 em vez de 401.
    assert.equal(retornoConfere("job_1", "curto", SEGREDO), false);
    assert.equal(retornoConfere("job_1", "x".repeat(200), SEGREDO), false);
  });
});
