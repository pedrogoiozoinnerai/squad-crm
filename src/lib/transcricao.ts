/**
 * A resposta da Deepgram, lida sem rede.
 *
 * A leitura é toda defensiva de propósito. Nada aqui pode lançar: quando este
 * código roda, o áudio de uma hora JÁ foi transcrito e JÁ foi pago. Uma chave
 * com outro nome do lado deles não pode transformar isso em zero — vale mais
 * guardar um texto sem os trechos do que perder a call inteira.
 */

export type Segmento = {
  /// Segundos desde o início da gravação. É o que sincroniza o texto ao player.
  inicio: number;
  fim: number;
  /// O número do falante que a diarização deu. NÃO é uma pessoa: numa sala de
  /// vinte, ninguém sabe qual número é quem, e prometer nome aqui seria
  /// inventar. O de-para, quando existir, é outro assunto.
  falante: number | null;
  texto: string;
};

export type FalanteMedido = {
  falante: number;
  segundos: number;
  /// Quantos trechos são dele. Duas falas longas e vinte curtas dizem coisas
  /// diferentes sobre quem conduziu a conversa.
  trechos: number;
};

export type Transcricao = {
  texto: string;
  segmentos: Segmento[];
  falantes: FalanteMedido[];
  duracaoSegundos: number | null;
  idioma: string | null;
  modelo: string | null;
  externoId: string | null;
};

function num(valor: unknown): number | null {
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

function texto(valor: unknown): string | null {
  return typeof valor === "string" && valor.trim() ? valor.trim() : null;
}

function objeto(valor: unknown): Record<string, unknown> | null {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : null;
}

/**
 * De um JSON da Deepgram para o nosso formato.
 *
 * O texto corrido tem três fontes possíveis, e a ordem importa. `paragraphs`
 * traz a pontuação e as quebras — é o único que se lê sem sofrer numa call de
 * uma hora. As falas (`utterances`) vêm em segundo porque, com diarização
 * ligada, elas dizem quem falou. O `transcript` solto é o último recurso: é uma
 * parede de texto de sessenta mil caracteres sem um parágrafo.
 */
export function lerRespostaDeepgram(bruto: unknown): Transcricao | null {
  const raiz = objeto(bruto);
  if (!raiz) return null;

  const metadados = objeto(raiz.metadata) ?? {};
  const resultados = objeto(raiz.results) ?? {};

  const canal = Array.isArray(resultados.channels) ? objeto(resultados.channels[0]) : null;
  const alternativa =
    canal && Array.isArray(canal.alternatives) ? objeto(canal.alternatives[0]) : null;

  const falas = Array.isArray(resultados.utterances) ? resultados.utterances : [];
  const segmentos: Segmento[] = [];
  for (const bruta of falas) {
    const fala = objeto(bruta);
    const conteudo = fala && texto(fala.transcript);
    if (!fala || !conteudo) continue;
    segmentos.push({
      inicio: num(fala.start) ?? 0,
      fim: num(fala.end) ?? 0,
      falante: num(fala.speaker),
      texto: conteudo,
    });
  }

  const paragrafos = alternativa ? objeto(alternativa.paragraphs) : null;
  const corrido =
    (paragrafos && texto(paragrafos.transcript)) ??
    (segmentos.length > 0 ? segmentos.map((s) => s.texto).join("\n\n") : null) ??
    (alternativa && texto(alternativa.transcript));

  // Sem texto não há transcrição — e devolver uma vazia faria o próximo passo
  // mandar uma call em branco para a análise, que responderia alguma coisa.
  if (!corrido) return null;

  const modelos = Array.isArray(metadados.models) ? metadados.models : [];
  const infoDoModelo = objeto(metadados.model_info);
  const nomeDoModelo =
    (infoDoModelo &&
      Object.values(infoDoModelo)
        .map((m) => objeto(m)?.name)
        .find((n) => typeof n === "string")) ??
    (typeof modelos[0] === "string" ? modelos[0] : null);

  return {
    texto: corrido,
    segmentos,
    falantes: medirFalantes(segmentos),
    duracaoSegundos: num(metadados.duration),
    idioma: (canal && texto(canal.detected_language)) ?? null,
    modelo: typeof nomeDoModelo === "string" ? nomeDoModelo : null,
    externoId: texto(metadados.request_id),
  };
}

/** Quanto cada falante ocupou. Ordenado do que mais falou para o que menos. */
export function medirFalantes(segmentos: Segmento[]): FalanteMedido[] {
  const por = new Map<number, FalanteMedido>();
  for (const s of segmentos) {
    if (s.falante === null) continue;
    const atual = por.get(s.falante) ?? { falante: s.falante, segundos: 0, trechos: 0 };
    atual.segundos += Math.max(0, s.fim - s.inicio);
    atual.trechos += 1;
    por.set(s.falante, atual);
  }
  return [...por.values()].sort((a, b) => b.segundos - a.segundos);
}

/**
 * Quem conduziu, provavelmente.
 *
 * Numa sessão coletiva quem mais fala é o closer — ele apresenta por quarenta
 * minutos. É um palpite, e por isso se chama "provável": devolve `null` quando
 * há empate ou quase, porque numa 1:1 equilibrada o número não significa nada e
 * chutar ali trocaria o vendedor pelo cliente na tela inteira.
 */
export function provavelCondutor(falantes: FalanteMedido[]): number | null {
  const [primeiro, segundo] = falantes;
  if (!primeiro) return null;
  if (!segundo) return primeiro.falante;
  // Precisa ter falado pelo menos metade a mais que o seguinte.
  return primeiro.segundos >= segundo.segundos * 1.5 ? primeiro.falante : null;
}

/// O modelo. `nova-3` é o mais recente; confirmar no painel se ele atende pt-BR
/// antes de ligar — se não atender, é `nova-2`, e a troca é aqui.
export const MODELO_PADRAO = "nova-3";

/**
 * Os parâmetros do pedido de transcrição.
 *
 * `callback` é o que tira o trabalho de dentro dos 60 segundos da função: a
 * Deepgram responde na hora com um `request_id` e devolve o texto pronto
 * depois, numa requisição nossa própria.
 */
export function parametrosDaDeepgram(opcoes: {
  callback: string;
  modelo?: string;
  idioma?: string;
}): string {
  const p = new URLSearchParams({
    model: opcoes.modelo ?? MODELO_PADRAO,
    language: opcoes.idioma ?? "pt-BR",
    // Pontuação e parágrafos: sem eles a call vira sessenta mil caracteres sem
    // um ponto final, e nem o humano nem o modelo leem aquilo direito.
    punctuate: "true",
    paragraphs: "true",
    // Quem falou. Não dá nome a ninguém — dá número —, e é o que permite
    // separar o closer da sala.
    diarize: "true",
    utterances: "true",
    smart_format: "true",
    callback: opcoes.callback,
  });
  return p.toString();
}
