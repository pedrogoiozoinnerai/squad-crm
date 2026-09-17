/**
 * Quando a sala de uma reunião está aberta.
 *
 * Função pura, e num arquivo só, porque DUAS coisas precisam concordar: a
 * página que mostra o botão "entrar" e a rota que emite o token. Se elas
 * divergirem, o lead vê um botão que a API recusa — e o erro aparece depois do
 * clique, sem explicação, no minuto em que a reunião ia começar.
 */

/// Abre antes da hora: lead que chega adiantado tem que conseguir esperar
/// dentro da sala, não numa tela dizendo "ainda não".
export const ABRE_ANTES_MIN = 30;

/// E fecha bem depois: call que atrasa ou emenda não pode expulsar ninguém.
export const FECHA_DEPOIS_MIN = 120;

export type SituacaoDaSala = "esperando" | "aberta" | "encerrada" | "cancelada";

export function janelaDaSala(reuniao: { startsAt: Date; endsAt: Date }) {
  return {
    abreEm: new Date(reuniao.startsAt.getTime() - ABRE_ANTES_MIN * 60_000),
    fechaEm: new Date(reuniao.endsAt.getTime() + FECHA_DEPOIS_MIN * 60_000),
  };
}

export function situacaoDaSala(
  reuniao: { startsAt: Date; endsAt: Date; status: string },
  agora: Date,
): SituacaoDaSala {
  if (reuniao.status === "CANCELED") return "cancelada";

  // `DONE` fecha a sala, mesmo dentro da janela de horário.
  //
  // Sem isto, "encerrar a sessão para todos" só derrubava a conexão: o link
  // continuava valendo, e quem recarregasse a página reabria a sala e ficava
  // lá sozinho esperando alguém. Encerrar é uma decisão sobre a REUNIÃO, e ela
  // precisa sobreviver ao F5.
  if (reuniao.status === "DONE") return "encerrada";

  const { abreEm, fechaEm } = janelaDaSala(reuniao);
  if (agora < abreEm) return "esperando";
  if (agora > fechaEm) return "encerrada";
  return "aberta";
}
