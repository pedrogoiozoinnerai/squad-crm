/** A operação inteira roda no fuso de São Paulo. */
export const TZ = "America/Sao_Paulo";

export const WEEK_DAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

/**
 * Segunda-feira da semana que contém `date`, com deslocamento em semanas.
 *
 * O instante da meia-noite de segunda **em São Paulo**, não no relógio de quem
 * executa. `startOfWeek` do date-fns seguido de `setHours(0,0,0,0)` dava
 * meia-noite UTC na Vercel — que é 21:00 de domingo aqui, e jogava a grade
 * inteira do calendário um dia para trás.
 */
export function weekStart(date = new Date(), offset = 0, tz = TZ) {
  const { ano, mes, dia } = diaCivil(date, tz);
  // 1 = segunda … 7 = domingo, como o resto do sistema já convenciona.
  const diaDaSemana = diaIso(date, tz);
  const meiaNoite = Date.UTC(ano, mes - 1, dia - (diaDaSemana - 1) + offset * 7);
  return instanteLocal(new Date(meiaNoite), "00:00", tz);
}

/**
 * Os sete dias da semana, como instantes de meia-noite local.
 *
 * Soma dias de CALENDÁRIO, não 24 horas: na virada do horário de verão um dia
 * tem 23 ou 25 horas, e somar 86.400.000 deslocaria todos os dias seguintes.
 */
export function weekDays(start: Date, tz = TZ) {
  const { ano, mes, dia } = diaCivil(start, tz);
  return Array.from({ length: 7 }, (_, i) =>
    instanteLocal(new Date(Date.UTC(ano, mes - 1, dia + i)), "00:00", tz),
  );
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

/**
 * O dia de calendário de um instante, num fuso.
 *
 * `en-CA` devolve AAAA-MM-DD, que é o formato que ordena como texto e não
 * depende de locale. `getFullYear()` e companhia leem o relógio do servidor —
 * na Vercel isso é UTC, e três horas depois da meia-noite de São Paulo já é
 * outro dia lá.
 */
export function diaCivil(instante: Date, tz = TZ) {
  const [ano, mes, dia] = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(instante)
    .split("-")
    .map(Number);
  return { ano, mes, dia };
}

/** A chave "2026-10-06" de um instante no fuso. Serve para agrupar e comparar. */
export function chaveDoDia(instante: Date, tz = TZ) {
  const { ano, mes, dia } = diaCivil(instante, tz);
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/** Dia da semana no fuso: 1 = segunda … 7 = domingo. */
export function diaIso(instante: Date, tz = TZ) {
  const curto = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(
    instante,
  );
  const ordem = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return ordem.indexOf(curto) + 1;
}

/** A hora cheia de um instante no fuso — a linha em que a reunião cai na grade. */
export function horaLocal(instante: Date, tz = TZ) {
  const h = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "2-digit", hour12: false }).format(
      instante,
    ),
  );
  // `hour12: false` devolve 24 à meia-noite em alguns runtimes.
  return h % 24;
}

/**
 * O instante de um campo `datetime-local`, lido no fuso certo.
 *
 * `new Date("2026-10-06T14:00")` — sem fuso na string — é interpretado no
 * relógio do RUNTIME, por especificação. Na Vercel, que roda em UTC, uma
 * reunião marcada para as 14:00 virava 14:00Z, que são 11:00 aqui: o lead
 * recebia o convite com a hora errada e a sala abria três horas antes.
 */
export function instanteDeCampoLocal(valor: string, tz = TZ): Date | null {
  const casou = valor.trim().match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (!casou) return null;
  const [, ano, mes, dia, hora, minuto] = casou;
  const instante = instanteLocal(
    new Date(Date.UTC(Number(ano), Number(mes) - 1, Number(dia))),
    `${hora}:${minuto}`,
    tz,
  );
  return Number.isNaN(instante.getTime()) ? null : instante;
}

/** O caminho de volta: o valor que preenche um `<input type="datetime-local">`. */
export function paraCampoLocal(instante: Date, tz = TZ) {
  return `${chaveDoDia(instante, tz)}T${hhmm(instante, tz)}`;
}

export function isSameDay(a: Date, b: Date, tz = TZ) {
  return chaveDoDia(a, tz) === chaveDoDia(b, tz);
}

export function hhmm(date: Date, tz = TZ) {
  return date.toLocaleTimeString("pt-BR", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
  });
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
export function diaMes(date: Date, tz = TZ) {
  return date.toLocaleDateString("pt-BR", { timeZone: tz, day: "2-digit", month: "2-digit" });
}

/**
 * Distância em dias de calendário, não em horas. "Venceu ontem" tem que dizer
 * 1 dia mesmo quando faltam 20 horas para completar 24 — é assim que a pessoa
 * lê um prazo.
 *
 * Os dias são os de São Paulo. `setHours(0,0,0,0)` zerava no relógio do
 * servidor, então entre 21:00 e 00:00 daqui a Vercel já contava o dia seguinte
 * e uma tarefa de hoje aparecia como "venceu ontem".
 */
export function diasEntre(de: Date, para: Date, tz = TZ) {
  const meiaNoite = (d: Date) => {
    const { ano, mes, dia } = diaCivil(d, tz);
    return Date.UTC(ano, mes - 1, dia);
  };
  return Math.round((meiaNoite(para) - meiaNoite(de)) / 86_400_000);
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
