/**
 * Quem é quem dentro de uma sala — e qual sala é qual reunião.
 *
 * Separado de `livekit.ts` por uma razão de empacotamento, não de estética:
 * aquele módulo importa `node:crypto` para assinar os dois JWT, e o navegador
 * não tem `node:crypto`. A tela da sala precisa saber reconhecer o gravador
 * para não desenhá-lo, e sem esta separação ela arrastaria o assinador de
 * tokens inteiro para dentro do pacote do cliente — ou, pior, a regra seria
 * copiada e as duas cópias divergiriam, que é o defeito que este repositório
 * já pagou três vezes.
 *
 * Tudo aqui é string. Nenhuma dependência, nem de Node nem do LiveKit.
 */

/**
 * O nome da sala no LiveKit — uma por REUNIÃO, não uma por vendedor.
 *
 * O CRM de referência usa sala fixa por closer (`closer-<uuid>`). Fica um link
 * estável, mas obriga a descobrir a qual reunião cada entrada pertence
 * comparando horários, e aí presença virou palpite: são 1.028 participações
 * esperando reprocessamento manual do lado deles.
 *
 * Com uma sala por reunião a atribuição é chave estrangeira, não janela de
 * tempo. Nenhuma ambiguidade quando a call atrasa, emenda ou vira outra.
 */
export function salaDaReuniao(meetingId: string) {
  return `reuniao-${meetingId}`;
}

export function reuniaoDaSala(sala: string) {
  return sala.startsWith("reuniao-") ? sala.slice("reuniao-".length) : null;
}

/**
 * A identidade carrega de quem ela é.
 *
 * Sem prefixo, o evento de entrada traz um id solto e alguém precisa adivinhar
 * se é vendedor ou lead — e um id de lead que colide com um de usuário
 * atribuiria presença à pessoa errada.
 */
export function identidadeDoUsuario(userId: string) {
  return `u_${userId}`;
}

export function identidadeDoLead(leadId: string) {
  return `l_${leadId}`;
}

export function lerIdentidade(identidade: string) {
  if (ehGravador(identidade)) return { tipo: "gravador" as const, id: identidade.slice(3) };
  if (identidade.startsWith("u_")) return { tipo: "usuario" as const, id: identidade.slice(2) };
  if (identidade.startsWith("l_")) return { tipo: "lead" as const, id: identidade.slice(2) };
  if (identidade.startsWith("c_")) return { tipo: "convidado" as const, id: identidade.slice(2) };
  return { tipo: "desconhecido" as const, id: identidade };
}

/**
 * Isto é o gravador, não uma pessoa.
 *
 * A gravação entra na sala como participante de verdade: o LiveKit sobe um
 * navegador sem tela, ele faz `join` e o webhook manda `participant_joined`
 * como manda de qualquer um. A identidade tem o prefixo `EG_`, que é do
 * LiveKit e não nosso.
 *
 * Sem esta função ele vira duas coisas erradas ao mesmo tempo: uma linha em
 * `Presence` — inflando a contagem de quem esteve na call e, numa sessão de dois
 * inscritos, dobrando a taxa de presença — e um quadrado preto no meio de uma
 * tela de trinta pessoas, que ninguém consegue explicar.
 */
export function ehGravador(identidade: string) {
  return identidade.startsWith("EG_");
}

/**
 * Identidade de quem entra pelo link da reunião.
 *
 * O sufixo é aleatório por ENTRADA, não por pessoa: o link é um só e pode ser
 * aberto por várias pessoas ao mesmo tempo, e identidade repetida faz o LiveKit
 * derrubar quem entrou antes. Duas pessoas pelo mesmo link viram dois
 * participantes, que é a verdade.
 *
 * Aparece em `Presence` como qualquer um — e não vira inscrito de ninguém,
 * porque ninguém o inscreveu. É a diferença entre medir e atribuir.
 */
export function identidadeDeConvidado(sufixo: string) {
  return `c_${sufixo}`;
}
