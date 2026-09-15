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

/**
 * Quantos minutos o fuso `tz` está à frente do UTC **naquele instante**.
 *
 * Tem que ser por instante, não por fuso: São Paulo já foi -02 no horário de
 * verão e é -03 fora dele, e o histórico importado atravessa os dois.
 */
function minutosDeDiferenca(instante: Date, tz: string) {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instante);

  const campo = (tipo: string) => Number(partes.find((p) => p.type === tipo)?.value ?? 0);
  // `hour12: false` devolve 24 à meia-noite em alguns runtimes; 24 e 0 são o
  // mesmo instante, e deixar passar erraria o dia inteiro por 24 horas.
  const hora = campo("hour") % 24;

  const comoSeFosseUTC = Date.UTC(
    campo("year"),
    campo("month") - 1,
    campo("day"),
    hora,
    campo("minute"),
    campo("second"),
  );
  return (comoSeFosseUTC - instante.getTime()) / 60_000;
}

/**
 * O instante exato de uma hora de parede num dia, num fuso.
 *
 * Existe porque `new Date(dia).setHours(10)` usa o fuso **do servidor**. Na sua
 * máquina isso é São Paulo e parece certo; na Vercel é UTC, e uma sessão das
 * 10:00 aparecia às 07:00 para o time inteiro. O bug já estava em produção.
 *
 * O dia sai dos componentes **UTC** de `dia` de propósito: a coluna guarda um
 * dia de calendário às 00:00, e quem escreveu pode ter sido um runtime em UTC
 * ou em São Paulo — as duas gravações caem no mesmo dia UTC.
 */
export function instanteLocal(dia: Date, hhmm: string, tz = TZ) {
  const [hora, minuto] = hhmm.split(":").map(Number);
  const parede = Date.UTC(
    dia.getUTCFullYear(),
    dia.getUTCMonth(),
    dia.getUTCDate(),
    Number.isFinite(hora) ? hora : 0,
    Number.isFinite(minuto) ? minuto : 0,
  );

  // Duas passadas: a primeira estima a diferença tratando a hora de parede
  // como UTC, a segunda confere no instante corrigido. Elas só divergem na
  // virada do horário de verão — e é exatamente ali que uma passada só erra
  // em uma hora.
  const primeira = minutosDeDiferenca(new Date(parede), tz);
  const corrigido = new Date(parede - primeira * 60_000);
  const segunda = minutosDeDiferenca(corrigido, tz);
  return primeira === segunda ? corrigido : new Date(parede - segunda * 60_000);
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
