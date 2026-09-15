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
  /// "HH:MM" na hora de parede do fuso da série.
  time: string;
  timezone: string;
  startsOn?: Date | null;
  endsOn?: Date | null;
};

/** Os dias da semana da série, saneados. Fora de 1..7 é ignorado. */
export function diasDaSemana(weekdays: string): number[] {
  const dias = weekdays
    .split(",")
    .map((d) => Number(d.trim()))
    .filter((d) => Number.isInteger(d) && d >= 1 && d <= 7);
  return [...new Set(dias)].sort((a, b) => a - b);
}

/**
 * Os instantes de início entre `de` e `ate`.
 *
 * Percorre dias de calendário em UTC e compõe a hora de parede pelo fuso da
 * série. Fazer o contrário — andar de 24 em 24 horas a partir do primeiro
 * instante — erraria em uma hora na virada do horário de verão, e a partir
 * dali toda sessão da série ficaria deslocada.
 */
export function slotsDaSerie(serie: SerieRecorrente, de: Date, ate: Date): Date[] {
  const dias = diasDaSemana(serie.weekdays);
  if (dias.length === 0) return [];

  const slots: Date[] = [];
  const cursor = new Date(
    Date.UTC(de.getUTCFullYear(), de.getUTCMonth(), de.getUTCDate()),
  );
  const limite = ate.getTime();

  // Teto por segurança: uma janela absurda não pode virar laço infinito nem
  // materializar dez anos de sessões por um valor errado no formulário.
  for (let i = 0; i < 400 && cursor.getTime() <= limite + 86_400_000; i++) {
    const diaIso = cursor.getUTCDay() === 0 ? 7 : cursor.getUTCDay();

    if (dias.includes(diaIso)) {
      const inicio = instanteLocal(cursor, serie.time, serie.timezone);
      const dentroDaJanela = inicio >= de && inicio <= ate;
      const depoisDoInicio = !serie.startsOn || inicio >= serie.startsOn;
      const antesDoFim = !serie.endsOn || inicio <= serie.endsOn;
      if (dentroDaJanela && depoisDoInicio && antesDoFim) slots.push(inicio);
    }

    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return slots;
}
