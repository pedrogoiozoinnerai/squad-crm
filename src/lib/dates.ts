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

/** Dia/mês, do jeito que cabe num cartão: "15/09". */
export function diaMes(date: Date) {
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

/**
 * Distância em dias de calendário, não em horas. "Venceu ontem" tem que dizer
 * 1 dia mesmo quando faltam 20 horas para completar 24 — é assim que a pessoa
 * lê um prazo.
 */
export function diasEntre(de: Date, para: Date) {
  const inicio = new Date(de);
  inicio.setHours(0, 0, 0, 0);
  const fim = new Date(para);
  fim.setHours(0, 0, 0, 0);
  return Math.round((fim.getTime() - inicio.getTime()) / 86_400_000);
}

/** Duração compacta para caber ao lado de outra informação: "3d", "2 sem". */
export function rotuloDeDias(dias: number) {
  const n = Math.abs(dias);
  if (n < 7) return `${n}d`;
  if (n < 30) return `${Math.floor(n / 7)} sem`;
  if (n < 365) return `${Math.floor(n / 30)} m`;
  return `${Math.floor(n / 365)} a`;
}

/**
 * Como um prazo se lê em relação a agora. Recebe `agora` em vez de chamar
 * `new Date()`: o cartão é renderizado no servidor e reidratado no cliente, e
 * duas leituras de relógio diferentes dariam textos diferentes nos dois lados.
 */
export function prazoRelativo(prazo: Date, agora: Date) {
  const dias = diasEntre(agora, prazo);

  // O que decide se está atrasado é o instante, não o dia: uma tarefa marcada
  // para hoje às 9h já venceu às 14h. O cartão conta as atrasadas por esta
  // mesma régua, e "1 atrasada" ao lado de "vence hoje" não faz sentido.
  if (prazo < agora) {
    return {
      texto: dias === 0 ? "venceu hoje" : `atrasada ${rotuloDeDias(dias)}`,
      atrasado: true,
    };
  }

  if (dias === 0) return { texto: "vence hoje", atrasado: false };
  if (dias === 1) return { texto: "vence amanhã", atrasado: false };
  return { texto: `em ${rotuloDeDias(dias)}`, atrasado: false };
}
