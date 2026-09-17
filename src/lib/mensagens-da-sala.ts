/**
 * As regras do chat da sala, sem React e sem rede.
 *
 * Puro de propósito: o que quebrava o chat não era a interface, era a costura
 * entre três fontes que chegam fora de ordem — o histórico do banco, o que
 * chega pelo canal de dados do LiveKit, e a própria mensagem que acabou de ser
 * digitada e ainda nem foi gravada. Conferir isso sem subir uma sala é o que
 * permite ter certeza de que ninguém aparece duas vezes.
 */

/// Teto do texto de uma mensagem. O mesmo número no cliente e no servidor: o
/// `maxLength` do campo é conveniência, não proteção.
export const LIMITE_DO_TEXTO = 2000;

/// Quantas mensagens o histórico devolve. Numa sessão de 40 pessoas o chat
/// cresce, e quem entra atrasado quer acompanhar o que está sendo dito agora —
/// não ler duas horas de conversa.
export const POR_SALA = 500;

export type Mensagem = {
  /// Id do banco quando já foi gravada; `local:…` enquanto está a caminho.
  id: string;
  /// Identidade do LiveKit de quem escreveu (`u_…`, `l_…`, `c_…`).
  identidade: string;
  autor: string;
  texto: string;
  em: Date;
  /// Escrita por mim. Não é `identidade === minha` porque a mensagem otimista
  /// nasce antes de o servidor dizer qual é a minha identidade.
  minha: boolean;
  /// Ainda não confirmada pelo servidor: some quando a gravação responde.
  aCaminho?: boolean;
  /// A gravação falhou. A mensagem FOI entregue pelo canal de dados, mas não
  /// vai sobreviver ao recarregar — e dizer isso é melhor que sumir com ela.
  naoGravada?: boolean;
};

/**
 * Texto aceitável, ou vazio.
 *
 * Corta pelas pontas e junta quebras de linha seguidas: colar um trecho de
 * documento no chat traz dez linhas em branco junto, e elas empurram a conversa
 * inteira para fora da tela.
 */
export function saneiaMensagem(bruto: string): string {
  return bruto
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, LIMITE_DO_TEXTO);
}

/**
 * Junta duas listas de mensagens sem repetir ninguém.
 *
 * Existe por uma corrida real: ao entrar, o cliente pede o histórico e ao mesmo
 * tempo começa a ouvir o canal de dados. Se alguém escreve nesse intervalo, a
 * mesma frase chega pelos dois caminhos — uma vez ao vivo, e de novo quando o
 * histórico responde. Sem isto, ela aparece duas vezes.
 *
 * O desempate é por `id`: o do banco é único, e o local (`local:…`) só colide
 * consigo mesmo. A ordem final é a cronológica, porque o histórico pode chegar
 * DEPOIS de mensagens ao vivo já terem entrado na lista.
 */
export function juntar(atuais: Mensagem[], chegando: Mensagem[]): Mensagem[] {
  const porId = new Map<string, Mensagem>();
  for (const m of [...atuais, ...chegando]) {
    // A versão mais nova ganha: é assim que a mensagem otimista vira a gravada
    // quando `confirmar` a substitui.
    porId.set(m.id, { ...porId.get(m.id), ...m });
  }
  return [...porId.values()].sort(
    (a, b) => a.em.getTime() - b.em.getTime() || a.id.localeCompare(b.id),
  );
}

/**
 * Troca a mensagem otimista pela que o servidor gravou.
 *
 * Mantém o INSTANTE local em vez do que o banco devolveu: trocar a hora faria a
 * mensagem pular de lugar na lista logo depois de aparecer, e quem escreveu vê
 * a própria frase se mexer sozinha. Os milissegundos de diferença não valem
 * isso.
 */
export function confirmar(
  mensagens: Mensagem[],
  idLocal: string,
  gravada: { id: string; identidade: string },
): Mensagem[] {
  return mensagens.map((m) =>
    m.id === idLocal
      ? { ...m, id: gravada.id, identidade: gravada.identidade, aCaminho: false }
      : m,
  );
}

/** Marca a mensagem que não conseguiu ser gravada — entregue, mas sem memória. */
export function marcarNaoGravada(mensagens: Mensagem[], idLocal: string): Mensagem[] {
  return mensagens.map((m) =>
    m.id === idLocal ? { ...m, aCaminho: false, naoGravada: true } : m,
  );
}

/**
 * O que vai pelo canal de dados do LiveKit.
 *
 * Um envelope com `tipo`, porque o canal é compartilhado: o LiveKit e qualquer
 * outro recurso nosso podem mandar coisas por ali, e ler tudo como chat
 * transformaria um pacote interno numa mensagem em branco no meio da conversa.
 */
export type Envelope = { tipo: "chat"; texto: string };

export function lerEnvelope(bruto: unknown): Envelope | null {
  if (typeof bruto !== "object" || bruto === null) return null;
  const e = bruto as Record<string, unknown>;
  if (e.tipo !== "chat" || typeof e.texto !== "string") return null;
  const texto = saneiaMensagem(e.texto);
  return texto ? { tipo: "chat", texto } : null;
}
