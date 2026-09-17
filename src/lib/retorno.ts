import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * O token que protege um endereço de retorno.
 *
 * A Deepgram **não assina** o callback. Diferente do LiveKit, que manda um JWT
 * com o sha256 do corpo, ela simplesmente faz um POST no endereço que a gente
 * deu — e qualquer um que descubra esse endereço pode fazer o mesmo POST e
 * gravar o "que foi dito" numa call de um cliente.
 *
 * Então o segredo é o próprio endereço: cada trabalho tem um token derivado do
 * id dele por HMAC. Derivado, e não sorteado e guardado numa coluna, por dois
 * motivos — não precisa de migração, e não existe janela entre criar o trabalho
 * e gravar o token em que um retorno chegaria sem nada para conferir.
 *
 * Isto é UMA das três travas, não a única: quem chama também confere o
 * `request_id` contra o que guardamos e passa pelo limite de taxa. Uma trava só
 * numa porta pública é uma trava que vai falhar sozinha.
 */
export function tokenDoRetorno(trabalhoId: string, segredo: string): string {
  return createHmac("sha256", segredo).update(`retorno:${trabalhoId}`).digest("hex").slice(0, 32);
}

/**
 * Confere o token sem vazar tempo.
 *
 * Comparação de string com `===` para em cima do primeiro caractere diferente,
 * e num endereço público isso é o bastante para alguém descobrir o token byte a
 * byte. É o mesmo cuidado que `lerWebhook` já toma com a assinatura do LiveKit.
 */
export function retornoConfere(trabalhoId: string, token: string, segredo: string): boolean {
  if (!segredo || !token) return false;
  const esperado = Buffer.from(tokenDoRetorno(trabalhoId, segredo));
  const veio = Buffer.from(token);
  return esperado.length === veio.length && timingSafeEqual(esperado, veio);
}
