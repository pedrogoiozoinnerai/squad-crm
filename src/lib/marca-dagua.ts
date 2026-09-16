/**
 * A marca d'água da sincronização com o funil.
 *
 * Puro e separado de `type-funnel.ts` porque aquele importa `server-only` e o
 * Prisma — e regra que não pode ser carregada num teste é regra que ninguém
 * confere. É a mesma separação que `escopo.ts` tem de `auth.ts` e `reuniao.ts`
 * tem da Server Action.
 *
 * O defeito que ela conserta perdia lead em silêncio: a leitura era
 * `ORDER BY "createdAt" DESC LIMIT 500`, relida inteira a cada dez minutos.
 * Numa rajada de mais de 500 leads em dez minutos — o que acontece quando uma
 * campanha entra no ar — os excedentes saíam da janela e nunca voltavam. Sem
 * erro, sem log, sem fila.
 */

/// Quanto a leitura traz por vez.
///
/// Pequeno de propósito: o laço de reconciliação é sequencial e cada lead
/// custa de quatro a oito idas ao banco. 200 cabem com folga no tempo da
/// função, e o que sobrar vem na página seguinte — sem perder nada, que era o
/// defeito da janela fixa de 500.
export const POR_PAGINA = 200;

/// Volta um pouco antes da marca ao reler.
///
/// Dois leads podem ter o MESMO `updatedAt` e cair em páginas diferentes; sem
/// a sobreposição, o segundo sumiria na virada. Reprocessar alguns segundos é
/// inofensivo — a reconciliação é idempotente — e é mais barato que uma lógica
/// de desempate por id.
const SOBREPOSICAO_MS = 2_000;

/// De onde começar quando ainda não há marca.
///
/// Sete dias, e não o começo dos tempos: na primeira execução depois do deploy
/// o histórico antigo já foi espelhado pela janela de 500 que existia antes.
/// Puxar tudo faria a primeira execução tentar reconciliar meses de uma vez.
const PRIMEIRA_JANELA_DIAS = 7;

export function inicioDaLeitura(marca: Date | null, agora: Date): Date {
  if (!marca) return new Date(agora.getTime() - PRIMEIRA_JANELA_DIAS * 24 * 60 * 60 * 1000);
  return new Date(marca.getTime() - SOBREPOSICAO_MS);
}

/**
 * A marca nova, a partir do que a página trouxe.
 *
 * Só avança DEPOIS de a página inteira ser reconciliada — avançar por lead
 * deixaria uma falha no meio marcando como visto o que não foi processado, e
 * aí o lead some de vez, que é exatamente o defeito que esta marca existe para
 * consertar.
 *
 * Devolve `null` quando a página não trouxe data nenhuma utilizável: nesse
 * caso a marca fica onde está, e a página seguinte tenta de novo.
 */
export function proximaMarca(datas: (string | null)[]): Date | null {
  return datas
    .map((d) => (d ? new Date(d) : null))
    .filter((d): d is Date => d !== null && !Number.isNaN(d.getTime()))
    .reduce<Date | null>((maior, d) => (!maior || d > maior ? d : maior), null);
}
