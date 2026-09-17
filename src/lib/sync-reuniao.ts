/**
 * O que a sincronização deve fazer com a reunião de um lead do funil.
 *
 * Puro e separado porque esta decisão já causou o pior defeito que a produção
 * teve: **a cada execução do cron, uma reunião nova para o mesmo lead.**
 *
 * O que acontecia. A busca pela reunião existente era só esta:
 *
 *     calBookingUid ? findUnique({ calBookingUid }) : null
 *       ?? findFirst({ leadId, calBookingUid: { not: null } })
 *
 * Os dois caminhos exigem `calBookingUid`. Isso funcionava quando o Cal.com era
 * quem agendava. Depois que o funil passou a reservar pela NOSSA agenda, o
 * `calBookingUid` virou nulo — e a busca deixou de encontrar qualquer coisa. O
 * `if (!reuniao)` seguinte então criava outra, e outra, e outra: seis por hora,
 * de dez em dez minutos, para sempre.
 *
 * Em produção isso deu 26 reuniões duplicadas para um único lead de teste em
 * quatro horas. A 1.000 leads por dia seriam 144 mil reuniões-lixo por dia, cada
 * uma na agenda de um vendedor.
 *
 * O sinal que faltava estava lá o tempo todo: o funil grava `crmMeetingId` no
 * instante da reserva. É a resposta autoritativa para "este lead já tem
 * reunião?", e ninguém perguntava.
 */

export type LinhaDoFunil = {
  /// Id da reunião no CRM, gravado pelo funil ao reservar. Quando existe, o
  /// agendamento é NOSSO e já está feito.
  crmMeetingId: string | null;
  /// Reserva no Cal.com. Nulo desde que o funil agenda pela nossa agenda.
  calBookingUid: string | null;
  /// Horário escolhido, se houver.
  agendadoEm: Date | null;
  /// Cancelou no Cal.com.
  cancelado: boolean;
};

export type ReuniaoExistente = {
  startsAt: Date;
  status: string;
  calBookingUid: string | null;
  type: string;
} | null;

export type Decisao =
  | { acao: "nada"; porque: string }
  | { acao: "criar" }
  | { acao: "atualizar" }
  | { acao: "cancelar" };

export function decidirReuniao(linha: LinhaDoFunil, existente: ReuniaoExistente): Decisao {
  // ── A reserva feita pela nossa própria agenda ────────────────────────────
  //
  // Primeiro de tudo, e sem nenhuma outra condição: quando o funil reservou
  // pela agenda do CRM, a inscrição na sessão coletiva É o agendamento. Não há
  // reunião 1:1 a criar, e — o que importa ainda mais — não há nada a
  // ATUALIZAR: a sessão coletiva é compartilhada, e mover o horário dela pelo
  // lead que por acaso passou pelo sync mudaria a sessão de todo mundo.
  if (linha.crmMeetingId) {
    return { acao: "nada", porque: "o funil reservou pela agenda do CRM" };
  }

  if (linha.cancelado) {
    return existente && existente.status !== "CANCELED"
      ? { acao: "cancelar" }
      : { acao: "nada", porque: "já está cancelada, ou nunca existiu" };
  }

  if (!linha.agendadoEm) {
    return { acao: "nada", porque: "o lead não marcou horário" };
  }

  if (!existente) return { acao: "criar" };

  // Nunca mexer numa sessão coletiva por este caminho: ela pertence à série e a
  // dezenas de pessoas, não a este lead.
  if (existente.type === "GROUP") {
    return { acao: "nada", porque: "é sessão coletiva — o horário não é deste lead" };
  }

  const mudou =
    existente.startsAt.getTime() !== linha.agendadoEm.getTime() ||
    existente.status === "CANCELED" ||
    existente.calBookingUid !== linha.calBookingUid;

  return mudou ? { acao: "atualizar" } : { acao: "nada", porque: "nada mudou" };
}
