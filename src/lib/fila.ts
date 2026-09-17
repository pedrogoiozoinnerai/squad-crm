/**
 * A fila de trabalho assíncrono, sem banco.
 *
 * Duas coisas obrigam a existir uma fila aqui, e nenhuma delas é volume: uma
 * função da Vercel tem 60 segundos, e transcrever uma call de uma hora não cabe
 * nisso; e tanto a Deepgram quanto a Anthropic respondem por CALLBACK ou por
 * lote, ou seja, o trabalho termina numa requisição que não é a que o começou.
 *
 * O que a fila NÃO faz: ela não é semeada por empurrão. O webhook não cria
 * trabalho nenhum — o cron pergunta ao banco "que gravação completa não tem
 * transcrição?" e deriva a lista dali. É a forma de `reconciliarPresencas`, e
 * pelo mesmo motivo: callback perdido, webhook que não chegou, deploy no meio
 * da call — tudo se conserta na execução seguinte, sem ninguém reenfileirar à
 * mão.
 *
 * Tudo aqui é puro, incluindo o relógio, que entra por parâmetro.
 */

export type EtapaDoTrabalho = "TRANSCREVER" | "ANALISAR" | "APAGAR" | "REDIGIR";

export type EstadoDoTrabalho =
  | "PENDENTE"
  /// Alguém pegou e está executando AGORA. Vale enquanto o arrendamento durar.
  | "ARRENDADO"
  /// Entregue ao provedor; esperando o callback ou o lote ficar pronto.
  | "AGUARDANDO"
  | "PRONTO"
  | "DESISTIU";

/**
 * A chave é de NEGÓCIO, não um id aleatório.
 *
 * `TRANSCREVER:<recordingId>` só pode existir uma vez. É isso que faz dois
 * crons sobrepostos — ou o cron e um botão de "tentar de novo" — criarem UM
 * trabalho, e não dois pedidos pagos ao mesmo provedor pelo mesmo áudio.
 */
export function chaveDoTrabalho(etapa: EtapaDoTrabalho, alvoId: string): string {
  return `${etapa}:${alvoId}`;
}

/// Quanto tempo um trabalho fica reservado para quem o pegou.
///
/// Maior que o teto de execução da função (60 s) com folga: se fosse menor, uma
/// segunda execução pegaria o mesmo trabalho enquanto a primeira ainda está
/// falando com o provedor, e o áudio seria enviado — e cobrado — duas vezes.
export const ARRENDAMENTO_MS = 5 * 60_000;

/// Quantas vezes tentar antes de parar.
///
/// Seis, com a espera dobrando: cobre pouco mais de uma hora. Passou disso, não
/// é instabilidade de rede — é chave errada, formato recusado ou conta sem
/// saldo, e nenhuma dessas melhora tentando de novo.
export const MAX_TENTATIVAS = 6;

/// Quanto esperar até o provedor responder, antes de considerar perdido.
///
/// A Deepgram responde o callback em minutos para uma call de uma hora. Duas
/// horas é folga larga — e existe porque callback perdido é silencioso: sem
/// prazo, o trabalho ficaria `AGUARDANDO` para sempre e a gravação nunca teria
/// transcrição, sem nenhum erro em lugar nenhum.
export const ESPERA_MAX_MS = 2 * 60 * 60_000;

/**
 * Quanto esperar antes da próxima tentativa.
 *
 * Dobra a partir de um minuto e para em trinta. O teto não é conforto: sem ele,
 * a sexta tentativa cairia trinta e duas vezes depois da primeira, e um
 * provedor que voltou em cinco minutos ficaria meia hora sem ser procurado.
 *
 * Sem sorteio. Tirar um número aleatório aqui tornaria isto não testável, e o
 * espalhamento que o sorteio daria já vem de graça: os trabalhos nascem em
 * horários diferentes porque as calls terminam em horários diferentes.
 */
export function backoff(tentativas: number): number {
  const minutos = Math.min(30, 2 ** Math.max(0, tentativas - 1));
  return minutos * 60_000;
}

export type Trabalho = {
  estado: EstadoDoTrabalho;
  tentativas: number;
  arrendadoAte: Date | null;
  proximaTentativaEm: Date | null;
  /// Quando foi entregue ao provedor. Só em `AGUARDANDO`.
  updatedAt?: Date | null;
};

export type PassoDoTrabalho =
  /// Pega e executa.
  | { acao: "tentar" }
  /// Alguém está com ele agora, ou a espera do provedor ainda não venceu.
  | { acao: "ocupado" }
  /// A hora da próxima tentativa ainda não chegou.
  | { acao: "esperar" }
  /// O provedor não respondeu no prazo: volta para a fila como falha.
  | { acao: "reenfileirar" }
  | { acao: "desistir" }
  /// Já acabou, ou já desistiu.
  | { acao: "nada" };

/**
 * O que fazer com este trabalho agora.
 *
 * A ordem das perguntas é a regra: primeiro o que já terminou, depois quem está
 * com ele, e só então se é hora. Perguntar "é hora?" antes de "alguém está com
 * ele?" faria duas execuções mandarem o mesmo áudio para o provedor — que é o
 * erro que custa dinheiro, não tempo.
 */
export function proximoPasso(trabalho: Trabalho, agora: Date): PassoDoTrabalho {
  if (trabalho.estado === "PRONTO" || trabalho.estado === "DESISTIU") return { acao: "nada" };

  if (trabalho.estado === "AGUARDANDO") {
    const desde = trabalho.updatedAt ?? null;
    if (desde && agora.getTime() - desde.getTime() > ESPERA_MAX_MS) {
      // O callback não veio. Não é sucesso nem erro do provedor — é silêncio, e
      // silêncio precisa virar uma tentativa, senão a gravação fica sem
      // transcrição para sempre e nada registra o porquê.
      return desistir(trabalho.tentativas + 1) ? { acao: "desistir" } : { acao: "reenfileirar" };
    }
    return { acao: "ocupado" };
  }

  if (trabalho.arrendadoAte && trabalho.arrendadoAte > agora) return { acao: "ocupado" };
  if (desistir(trabalho.tentativas)) return { acao: "desistir" };
  if (trabalho.proximaTentativaEm && trabalho.proximaTentativaEm > agora) return { acao: "esperar" };
  return { acao: "tentar" };
}

export function desistir(tentativas: number): boolean {
  return tentativas >= MAX_TENTATIVAS;
}

/** Como fica o trabalho depois de uma falha. */
export function aposFalhar(trabalho: Trabalho, agora: Date, erro: string) {
  const tentativas = trabalho.tentativas + 1;
  return {
    estado: (desistir(tentativas) ? "DESISTIU" : "PENDENTE") as EstadoDoTrabalho,
    tentativas,
    arrendadoAte: null,
    proximaTentativaEm: new Date(agora.getTime() + backoff(tentativas)),
    // Truncado: a mensagem de um provedor pode vir com o corpo inteiro da
    // resposta dentro, e isso não cabe — nem deve — numa coluna de erro.
    erro: erro.slice(0, 500),
  };
}
