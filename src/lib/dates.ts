import { addDays, startOfWeek } from "date-fns";

/** A operação inteira roda no fuso de São Paulo. */
export const TZ = "America/Sao_Paulo";

export const WEEK_DAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

/** Segunda-feira da semana que contém `date`, com deslocamento em semanas. */
export function weekStart(date = new Date(), offset = 0) {
  const monday = startOfWeek(date, { weekStartsOn: 1 });
  monday.setHours(0, 0, 0, 0);
  return addDays(monday, offset * 7);
}

export function weekDays(start: Date) {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function hhmm(date: Date) {
  return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/** Formata um valor em CENTAVOS. Todo dinheiro no sistema é inteiro. */
export function brl(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
}

/** Valor em centavos para o formato aceito por `<input>` ("45360.00"). */
export function centsToInput(cents: number) {
  return cents ? (cents / 100).toFixed(2) : "";
}
