import { instanteLocal } from "@/lib/dates";

/**
 * De uma série recorrente para os instantes concretos.
 *
 * Puro e sem relógio próprio: é o que permite testar o horário de verão e a
 * virada de mês sem subir banco nem servidor. O materializador só transforma o
 * que sai daqui em linhas.
 */

export type SerieRecorrente = {
  /// "1,3,5" — 1 é segunda e 7 é domingo, como o schema declara.
  weekdays: string;
  /// "08:00,09:00,…,20:00" — horas de parede no fuso da série.
  ///
  /// Lista e não valor único desde que a agenda do funil passou a abrir um
  /// horário por hora. Mesma convenção de `weekdays`, no mesmo model: quem
  /// aprende uma, lê a outra.
  times: string;
  timezone: string;
  startsOn?: Date | null;
  endsOn?: Date | null;
};

/// Teto de DIAS percorridos. Uma janela absurda não pode virar laço infinito.
const MAX_DIAS = 400;

/// Teto de HORÁRIOS por série. Mais horários que horas no dia é sempre engano.
const MAX_HORARIOS = 24;

/// Teto de SLOTS.
///
/// O teto de dias deixou de bastar quando a série virou multi-horário: 400
/// dias × 13 horários são 5.200 instantes gerados só para o chamador
/// descartar. 1.000 está acima de qualquer configuração que a validação
/// aceita (24 horários × 31 dias = 744) e ainda corta uma disparatada.
export const LIMITE_DE_SLOTS = 1000;

/** Os dias da semana da série, saneados. Fora de 1..7 é ignorado. */
export function diasDaSemana(weekdays: string): number[] {
  const dias = weekdays
    .split(",")
    .map((d) => Number(d.trim()))
    .filter((d) => Number.isInteger(d) && d >= 1 && d <= 7);
  return [...new Set(dias)].sort((a, b) => a - b);
}

/**
 * Os horários da série, saneados: "8:00" vira "08:00", repetido some, e a
 * ordem é crescente.
 *
 * A coluna é String livre, como `weekdays`: um valor torto não pode derrubar o
 * materializador às quatro da manhã. O que não casar com HH:MM é descartado,
 * não interpretado.
 */
export function horariosDaSerie(times: string): string[] {
  const horarios = times
    .split(",")
    .map((t) => t.trim())
    .map((t) => {
      const casou = t.match(/^(\d{1,2}):(\d{2})$/);
      if (!casou) return null;
      const hora = Number(casou[1]);
      const minuto = Number(casou[2]);
      if (hora < 0 || hora > 23 || minuto < 0 || minuto > 59) return null;
      return `${String(hora).padStart(2, "0")}:${String(minuto).padStart(2, "0")}`;
    })
    .filter((t): t is string => t !== null);

  return [...new Set(horarios)].sort().slice(0, MAX_HORARIOS);
}

/**
 * Os instantes de início entre `de` e `ate`.
 *
 * Percorre dias de calendário em UTC e compõe a hora de parede pelo fuso da
 * série. Fazer o contrário — andar de 24 em 24 horas a partir do primeiro
 * instante — erraria em uma hora na virada do horário de verão, e a partir
 * dali toda sessão da série ficaria deslocada.
 *
 * Emite dia a dia e, dentro do dia, hora a hora: é o que mantém a saída em
 * ordem cronológica, de que o corte do materializador depende para descartar a
 * cauda e não o meio.
 */
export function slotsDaSerie(
  serie: SerieRecorrente,
  de: Date,
  ate: Date,
  limite = LIMITE_DE_SLOTS,
): Date[] {
  const dias = diasDaSemana(serie.weekdays);
  const horarios = horariosDaSerie(serie.times);
  if (dias.length === 0 || horarios.length === 0) return [];

  const slots: Date[] = [];
  const cursor = new Date(
    Date.UTC(de.getUTCFullYear(), de.getUTCMonth(), de.getUTCDate()),
  );
  const limiteDaJanela = ate.getTime();

  for (let i = 0; i < MAX_DIAS && cursor.getTime() <= limiteDaJanela + 86_400_000; i++) {
    const diaIso = cursor.getUTCDay() === 0 ? 7 : cursor.getUTCDay();

    if (dias.includes(diaIso)) {
      for (const hora of horarios) {
        const inicio = instanteLocal(cursor, hora, serie.timezone);
        const dentroDaJanela = inicio >= de && inicio <= ate;
        const depoisDoInicio = !serie.startsOn || inicio >= serie.startsOn;
        const antesDoFim = !serie.endsOn || inicio <= serie.endsOn;
        if (dentroDaJanela && depoisDoInicio && antesDoFim) slots.push(inicio);
        if (slots.length >= limite) return slots;
      }
    }

    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return slots;
}
