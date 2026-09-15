import { diaCivil, instanteLocal, TZ } from "@/lib/dates";

/**
 * Até quando a agenda vai.
 *
 * Existe como módulo próprio porque a regra precisa ser UMA. Antes eram duas e
 * elas já discordavam: `SessionTemplate.horizonDays` valia 28 no
 * materializador, e a rota pública de disponibilidade tinha o seu próprio
 * `HORIZONTE_DIAS = 21` cravado. Materializar mais do que se mostra é
 * desperdício; mostrar mais do que se materializa é uma lista com buracos.
 *
 * Puro, e o mês civil sai do `Intl` — nunca de `Date#getMonth()`, que lê o
 * relógio de quem executa. Na Vercel, que roda em UTC, as três últimas horas
 * de todo dia 31 já seriam o mês seguinte.
 */

/**
 * O último instante do mês que contém `instante`, no fuso.
 *
 * É a meia-noite do dia 1º do mês seguinte menos um milissegundo. Calcular
 * assim, e não "dia 30 ou 31 às 23:59", evita a tabela de quantos dias tem
 * cada mês e acerta fevereiro bissexto de graça.
 */
export function fimDoMes(instante: Date, tz = TZ): Date {
  const { ano, mes } = diaCivil(instante, tz);
  // `Date.UTC` normaliza o mês 12 para janeiro do ano seguinte sozinho, mas o
  // cálculo fica explícito para quem lê não precisar confiar nisso.
  const proximoAno = mes === 12 ? ano + 1 : ano;
  const proximoMes = mes === 12 ? 1 : mes + 1;
  const primeiroDoProximo = instanteLocal(
    new Date(Date.UTC(proximoAno, proximoMes - 1, 1)),
    "00:00",
    tz,
  );
  return new Date(primeiroDoProximo.getTime() - 1);
}

/**
 * O teto da agenda: o fim do mês corrente.
 *
 * Estrito, por decisão de produto. A consequência é real e não está escondida:
 * no dia 30 sobra um dia de agenda, e no dia 31 quase nada. Quem precisa ver
 * isso chegando é o time, não o lead — por isso `diasDeAgenda` existe e o
 * monitoramento avisa quando o horizonte encurta.
 */
export function horizonteDaAgenda(agora: Date, tz = TZ): Date {
  return fimDoMes(agora, tz);
}

/// Abaixo disto o monitoramento avisa que a agenda do funil está acabando.
export const DIAS_PARA_AVISAR = 5;

/**
 * Quantos dias de agenda ainda restam — o número que vira aviso na tela.
 *
 * Conta dias de calendário daqui, não frações: "acaba em 2 dias" é o que a
 * pessoa lê, e 1,4 dia não é uma frase.
 */
export function diasDeAgenda(agora: Date, tz = TZ): number {
  const fim = horizonteDaAgenda(agora, tz);
  const dia = (d: Date) => {
    const { ano, mes, dia: n } = diaCivil(d, tz);
    return Date.UTC(ano, mes - 1, n);
  };
  return Math.max(0, Math.round((dia(fim) - dia(agora)) / 86_400_000));
}

/** A agenda está perto do fim? É o gatilho do aviso no monitoramento. */
export function agendaAcabando(agora: Date, tz = TZ): boolean {
  return diasDeAgenda(agora, tz) < DIAS_PARA_AVISAR;
}
