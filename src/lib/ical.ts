/**
 * O convite de calendário — o arquivo `.ics`.
 *
 * É a única lembrança que funciona hoje. Não temos serviço de e-mail nem canal
 * de WhatsApp ligado, então, depois de agendar, o lead sai da nossa tela e nada
 * mais o alcança: quem fecha a aba perde o link e some. Um `.ics` transfere a
 * lembrança para o aparelho DELE — o alarme toca no celular dele, no calendário
 * dele, sem depender de nós entregarmos nada.
 *
 * Google Agenda já existia no funil, por link. Não basta: metade do Brasil abre
 * o convite no iPhone, e o link do Google não serve para o Apple Calendar nem
 * para o Outlook. O `.ics` serve para os três.
 *
 * Puro de propósito — sem banco, sem rede e sem relógio próprio. O formato tem
 * regras chatas (CRLF, dobra de linha em 75 octetos, escape de vírgula) que são
 * exatamente o tipo de coisa que quebra em silêncio: o arquivo baixa, o
 * calendário recusa, e ninguém fica sabendo.
 */

export type EventoDeCalendario = {
  /// Identificador estável. Reimportar o mesmo `uid` ATUALIZA o compromisso em
  /// vez de criar um segundo — é o que faz remarcar funcionar.
  uid: string;
  inicio: Date;
  fim: Date;
  titulo: string;
  descricao: string;
  /// O link da sala. Vai em `LOCATION` e em `URL`: o Google lê o primeiro, o
  /// Apple Calendar mostra o segundo, e ninguém lê os dois.
  url?: string;
  organizador?: { nome: string; email?: string };
  /// Quantos minutos antes o alarme toca. Vazio = sem alarme.
  alarmesMin?: number[];
  /// Vira `SEQUENCE`: o calendário só aceita a atualização se for MAIOR que a
  /// que ele já tem. Sem isso, remarcar não muda nada no aparelho do lead.
  versao?: number;
  cancelado?: boolean;
};

/**
 * Data no formato do iCalendar, sempre em UTC.
 *
 * `20260917T110000Z`. Em UTC e não no fuso local porque aí não é preciso
 * carregar a definição do fuso dentro do arquivo (`VTIMEZONE`), que é a parte
 * do formato que mais quebra entre clientes.
 */
export function carimbo(d: Date): string {
  const dois = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}${dois(d.getUTCMonth() + 1)}${dois(d.getUTCDate())}` +
    `T${dois(d.getUTCHours())}${dois(d.getUTCMinutes())}${dois(d.getUTCSeconds())}Z`
  );
}

/**
 * Escapa um texto para o iCalendar.
 *
 * Vírgula e ponto-e-vírgula separam valores no formato, então um nome de
 * empresa com vírgula ("Acme, Ltda") parte o campo em dois e o resto do arquivo
 * desanda. A contrabarra vem primeiro, senão escaparíamos as nossas próprias.
 */
export function escapar(texto: string): string {
  return texto
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/**
 * Dobra a linha em 75 octetos, como o formato exige.
 *
 * Conta OCTETOS, não caracteres: "Apresentação" tem 12 caracteres e 14 bytes em
 * UTF-8, e cortar por caractere estoura o limite em qualquer texto com acento —
 * ou seja, em todos os nossos. A continuação começa com um espaço.
 */
export function dobrar(linha: string): string {
  const bytes = Buffer.from(linha, "utf8");
  if (bytes.length <= 75) return linha;

  const partes: string[] = [];
  let inicio = 0;
  let limite = 75;

  while (inicio < bytes.length) {
    let fim = Math.min(inicio + limite, bytes.length);
    // Não cortar no meio de um caractere de vários bytes: os bytes de
    // continuação em UTF-8 têm o padrão 10xxxxxx.
    while (fim > inicio && fim < bytes.length && (bytes[fim] & 0xc0) === 0x80) fim--;
    partes.push(bytes.subarray(inicio, fim).toString("utf8"));
    inicio = fim;
    // A partir da segunda, a linha começa com um espaço, que também conta.
    limite = 74;
  }

  return partes.join("\r\n ");
}

/** Monta o arquivo. O calendário exige CRLF — LF sozinho é recusado por alguns. */
export function calendarioDe(evento: EventoDeCalendario, agora: Date): string {
  const linhas: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Squad.com//MeetSquad//PT-BR",
    "CALSCALE:GREGORIAN",
    `METHOD:${evento.cancelado ? "CANCEL" : "PUBLISH"}`,
    "BEGIN:VEVENT",
    `UID:${escapar(evento.uid)}`,
    `DTSTAMP:${carimbo(agora)}`,
    `DTSTART:${carimbo(evento.inicio)}`,
    `DTEND:${carimbo(evento.fim)}`,
    `SEQUENCE:${Math.max(0, Math.trunc(evento.versao ?? 0))}`,
    `STATUS:${evento.cancelado ? "CANCELLED" : "CONFIRMED"}`,
    `SUMMARY:${escapar(evento.titulo)}`,
    `DESCRIPTION:${escapar(evento.descricao)}`,
  ];

  if (evento.url) {
    linhas.push(`LOCATION:${escapar(evento.url)}`);
    linhas.push(`URL:${escapar(evento.url)}`);
  }

  if (evento.organizador) {
    const email = evento.organizador.email ?? "nao-responda@squad.com";
    linhas.push(`ORGANIZER;CN=${escapar(evento.organizador.nome)}:mailto:${email}`);
  }

  // O alarme é o motivo de o arquivo existir: sem ele, o compromisso fica no
  // calendário e ninguém é avisado.
  for (const min of evento.alarmesMin ?? []) {
    linhas.push(
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `TRIGGER:-PT${Math.max(0, Math.trunc(min))}M`,
      `DESCRIPTION:${escapar(evento.titulo)}`,
      "END:VALARM",
    );
  }

  linhas.push("END:VEVENT", "END:VCALENDAR");
  return linhas.map(dobrar).join("\r\n") + "\r\n";
}

/// Um dia antes e quinze minutos antes.
///
/// Os dois momentos em que dá para agir: na véspera ainda dá tempo de remarcar
/// o resto do dia; quinze minutos antes é quando a pessoa precisa parar o que
/// está fazendo. Uma hora antes, que era a terceira opção, vira ruído — quem
/// ouve três alarmes desliga os três.
export const ALARMES_PADRAO = [24 * 60, 15];
