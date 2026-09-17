/**
 * Presença derivada dos eventos de sala.
 *
 * Tudo aqui é função pura, sem banco e sem relógio próprio: é o que permite
 * testar os casos que quebram na vida real — queda de conexão no meio da
 * call, evento de saída perdido, reentrega do mesmo evento.
 *
 * A regra que importa mais é a última: **ausência de evento não é ausência de
 * pessoa.** Quando não chegou nada, a resposta é "sem dados", nunca
 * "não compareceu". É exatamente aí que o CRM de referência erra, e por isso
 * eles têm 1.028 participações para reprocessar à mão.
 */

import { ehGravador } from "@/lib/identidades";

export type EventoBruto = {
  type: string;
  at: Date;
  identity: string | null;
  name: string | null;
};

export type PresencaConsolidada = {
  identity: string;
  name: string | null;
  joinedAt: Date;
  leftAt: Date | null;
  seconds: number;
  /// Quantas vezes entrou. Duas entradas com quinze minutos somados contam a
  /// mesma coisa que uma — mas dizem coisas diferentes sobre a call, e é o
  /// número que explica um tempo baixo por queda de conexão.
  joinCount: number;
};

/**
 * Soma o tempo de cada participante a partir das entradas e saídas.
 *
 * `fimDaSala` fecha quem ficou com entrada em aberto — sai de `room_finished`
 * quando ele chegou. Sem isso, quem não deu "sair" (fechou a aba, caiu a
 * internet) ficaria com zero segundo, que é o inverso da verdade: normalmente
 * é quem ficou até o fim.
 */
export function consolidar(eventos: EventoBruto[], fimDaSala: Date | null): PresencaConsolidada[] {
  const ordenados = [...eventos].sort((a, b) => a.at.getTime() - b.at.getTime());

  const porIdentidade = new Map<
    string,
    {
      name: string | null;
      joinedAt: Date | null;
      leftAt: Date | null;
      seconds: number;
      aberto: Date | null;
      entradas: number;
    }
  >();

  for (const evento of ordenados) {
    if (!evento.identity) continue;
    // A gravação entra na sala como participante: o LiveKit sobe um navegador
    // sem tela e ele dá `join` como qualquer um. Contá-lo inflaria a presença
    // — e numa sessão de dois inscritos ele sozinho dobraria a taxa.
    if (ehGravador(evento.identity)) continue;
    if (evento.type !== "participant_joined" && evento.type !== "participant_left") continue;

    const atual = porIdentidade.get(evento.identity) ?? {
      name: null,
      joinedAt: null,
      leftAt: null,
      seconds: 0,
      aberto: null,
      entradas: 0,
    };
    if (evento.name) atual.name = evento.name;

    if (evento.type === "participant_joined") {
      atual.entradas += 1;
      if (!atual.joinedAt) atual.joinedAt = evento.at;
      // Entrada repetida sem a saída correspondente é saída perdida. Manter a
      // abertura antiga dá o mesmo total que fechar e reabrir no mesmo
      // instante — e evita inventar um intervalo de zero.
      if (!atual.aberto) atual.aberto = evento.at;
    } else {
      // Saída sem entrada é evento fora de ordem ou de antes da janela: não
      // dá para medir nada, e contar daria tempo negativo.
      if (atual.aberto) {
        atual.seconds += Math.max(0, Math.round((evento.at.getTime() - atual.aberto.getTime()) / 1000));
        atual.aberto = null;
      }
      atual.leftAt = evento.at;
    }

    porIdentidade.set(evento.identity, atual);
  }

  const consolidadas: PresencaConsolidada[] = [];
  for (const [identity, dados] of porIdentidade) {
    if (!dados.joinedAt) continue;

    let { seconds, leftAt } = dados;
    if (dados.aberto) {
      // Ficou em aberto: fecha no fim da sala, se a sala acabou. Se não
      // acabou, a reunião ainda está rolando — some o que já passou e deixa
      // `leftAt` nulo, que é a verdade.
      if (fimDaSala) {
        seconds += Math.max(0, Math.round((fimDaSala.getTime() - dados.aberto.getTime()) / 1000));
        leftAt = fimDaSala;
      }
    }

    consolidadas.push({
      identity,
      name: dados.name,
      joinedAt: dados.joinedAt,
      leftAt,
      seconds,
      joinCount: dados.entradas,
    });
  }

  return consolidadas.sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime());
}

export type RegraDePresenca = { presencaMinutos: number; presencaPercentual: number };

/**
 * O ponto de partida — não a regra em vigor.
 *
 * A regra que vale é a linha única de `Config`, editável no painel. Esta
 * constante existe só para o caso de ainda não haver linha, e tem que bater
 * com o `@default` do schema: `testes/presenca.test.ts` compara os dois e
 * quebra o build se divergirem. Já tivemos três cópias desta regra em lugares
 * diferentes, e nenhuma sabia das outras.
 */
export const REGRA_PADRAO: RegraDePresenca = { presencaMinutos: 5, presencaPercentual: 0 };

/**
 * Esteve na reunião?
 *
 * Os dois critérios valem JUNTOS. Só o percentual deixaria "3 minutos de uma
 * call de 5" passar como presença; só o absoluto trataria 10 minutos de uma
 * mentoria de duas horas como participação plena.
 */
export function atingiuPresenca(
  segundos: number,
  duracaoSegundos: number,
  regra: RegraDePresenca,
) {
  if (segundos <= 0) return false;
  if (segundos < regra.presencaMinutos * 60) return false;
  if (regra.presencaPercentual > 0 && duracaoSegundos > 0) {
    return segundos >= (duracaoSegundos * regra.presencaPercentual) / 100;
  }
  return true;
}

export type VeredictoDaReuniao =
  | { situacao: "sem_dados" }
  | { situacao: "participou"; segundos: number }
  | { situacao: "nao_compareceu" };

/**
 * O que aconteceu com o LEAD nesta reunião.
 *
 * `sem_dados` quando não chegou evento nenhum da sala. É um estado de terceira
 * via de propósito: marcar "não compareceu" sem evidência é afirmar algo falso
 * sobre uma pessoa, some com a reunião do relatório e ninguém descobre.
 */
export function veredicto(
  presencas: PresencaConsolidada[],
  houveEventoDeSala: boolean,
  duracaoSegundos: number,
  regra: RegraDePresenca,
): VeredictoDaReuniao {
  if (!houveEventoDeSala) return { situacao: "sem_dados" };

  const doLead = presencas.filter((p) => p.identity.startsWith("l_"));
  if (doLead.length === 0) return { situacao: "nao_compareceu" };

  // Um lead pode entrar de dois aparelhos; o tempo é o da soma.
  const segundos = doLead.reduce((soma, p) => soma + p.seconds, 0);
  return atingiuPresenca(segundos, duracaoSegundos, regra)
    ? { situacao: "participou", segundos }
    : { situacao: "nao_compareceu" };
}

// ── A taxa que a tela mostra ─────────────────────────────────────────────────
//
// Estas quatro estavam copiadas TRÊS vezes cada — em `queries.ts`, em
// `SessionsView` e em `SessionDrawer` —, e as cópias já tinham divergido: a
// tela da semana divide os presentes pelos inscritos DAS SESSÕES REALIZADAS,
// enquanto a consulta e o drawer dividem pelos inscritos DAQUELA sessão. Duas
// métricas diferentes com o mesmo nome na mesma tela.
//
// Separar e batizar as duas é o ponto de extrair: elas continuam diferentes,
// mas agora dizem qual são.

/** A taxa de UMA sessão: quantos dos inscritos dela apareceram. */
export function taxaDaSessao(inscritos: number, presentes: number): number {
  return inscritos ? Math.round((presentes / inscritos) * 100) : 0;
}

/**
 * Lead que vale a ligação.
 *
 * A régua A/B também estava em três lugares. Ela é de negócio, não de tela: o
 * dia em que "qualificado" incluir C, a mudança é aqui.
 */
export function ehQualificado(score: string | null | undefined): boolean {
  return score === "A" || score === "B";
}

export type SituacaoDaSessao = "cancelada" | "futura" | "emAndamento" | "medida";

/**
 * Em que ponto da vida a sessão está.
 *
 * Importa mais que a taxa: é ela que decide se o número é EXIBIDO ou se vira
 * "—". Uma sessão que ainda não aconteceu tem 0% de presença, e mostrar esse
 * zero faria a tela acusar o closer por uma call de amanhã.
 */
export function situacaoDaSessao(
  sessao: { status: string; startsAt: Date; endsAt: Date },
  agora: Date,
): SituacaoDaSessao {
  if (sessao.status === "CANCELED") return "cancelada";
  if (sessao.startsAt > agora) return "futura";
  if (sessao.endsAt > agora) return "emAndamento";
  return "medida";
}

export type TotaisDoPeriodo = {
  /// Quantas já terminaram — só elas entram na conta.
  realizadas: number;
  inscritosRealizados: number;
  presentes: number;
  qualificados: number;
  /// A taxa do PERÍODO: presentes ÷ inscritos das sessões realizadas. Não é a
  /// média das taxas — uma sessão de 1 inscrito pesaria igual a uma de 20.
  taxa: number;
};

export function totaisDoPeriodo(
  sessoes: readonly {
    status: string;
    startsAt: Date;
    endsAt: Date;
    inscritos: number;
    presentes: number;
    qualificados: number;
  }[],
  agora: Date,
): TotaisDoPeriodo {
  const realizadas = sessoes.filter((s) => situacaoDaSessao(s, agora) === "medida");
  const inscritosRealizados = realizadas.reduce((soma, s) => soma + s.inscritos, 0);
  const presentes = realizadas.reduce((soma, s) => soma + s.presentes, 0);

  return {
    realizadas: realizadas.length,
    inscritosRealizados,
    presentes,
    qualificados: realizadas.reduce((soma, s) => soma + s.qualificados, 0),
    taxa: taxaDaSessao(inscritosRealizados, presentes),
  };
}

// ── O que a página de UMA sessão pergunta ────────────────────────────────────
//
// A lista semanal responde "quantos vieram". A página de uma sessão responde
// outra coisa: **para quem eu ligo agora, e por quê**. Estas funções são a
// diferença entre um relatório e uma lista de trabalho.

/// Folga para considerar que alguém ficou até o fim.
///
/// Cinco minutos: a sala é fechada pelo LiveKit alguns minutos depois de
/// esvaziar, e quem sai no encerramento sai segundos antes de quem apaga a luz.
/// Sem a folga, praticamente ninguém "ficaria até o fim" — e o sinal que mais
/// importa no roster viraria ruído.
export const FOLGA_DO_FIM_MS = 5 * 60_000;

export type Saida =
  | { tipo: "nunca_entrou" }
  | { tipo: "ainda_na_sala" }
  | { tipo: "ficou_ate_o_fim" }
  /// Saiu antes. `minuto` é quantos minutos de call ele viu antes de sair — é
  /// esse número que diz se a pessoa desistiu na abertura ou na oferta.
  | { tipo: "saiu_antes"; minuto: number };

/**
 * Quando a pessoa saiu, contado do começo da call.
 *
 * É o sinal mais barato que a tela não tinha. "Saiu aos 12 min" e "ficou até o
 * fim" são dois leads completamente diferentes com o mesmo chip de *Presente*:
 * um viu a oferta, o outro saiu antes do diagnóstico. Hoje o closer liga para
 * os dois do mesmo jeito.
 */
export function saidaDoParticipante(
  participante: { joinedAt: Date | null; leftAt: Date | null },
  inicio: Date,
  fim: Date,
): Saida {
  if (!participante.joinedAt) return { tipo: "nunca_entrou" };
  if (!participante.leftAt) return { tipo: "ainda_na_sala" };
  if (participante.leftAt.getTime() >= fim.getTime() - FOLGA_DO_FIM_MS) {
    return { tipo: "ficou_ate_o_fim" };
  }
  return {
    tipo: "saiu_antes",
    minuto: Math.max(0, Math.round((participante.leftAt.getTime() - inicio.getTime()) / 60_000)),
  };
}

/**
 * A ordem do roster: para quem ligar primeiro.
 *
 * Qualificado antes de não qualificado, e dentro de cada grupo quem ficou mais
 * tempo antes de quem ficou menos. NÃO é ordem alfabética nem por horário de
 * entrada — é a ordem em que o closer deve gastar a próxima hora.
 *
 * Quem não apareceu vai para o fim, mas FICA na lista: ausência é trabalho
 * também, e some-lo da tela é como fingir que a vaga nunca foi vendida.
 */
export function ordemDoRoster<T extends { attended: boolean; totalSeconds: number; lead: { score: string | null } }>(
  participantes: readonly T[],
): T[] {
  const peso = (p: T) => (p.attended ? 0 : 2) + (ehQualificado(p.lead.score) ? 0 : 1);
  return [...participantes].sort(
    (a, b) => peso(a) - peso(b) || b.totalSeconds - a.totalSeconds,
  );
}

/**
 * Quantas pessoas estavam na sala num instante.
 *
 * Serve a uma pergunta comercial, não técnica: a oferta foi mandada no chat
 * quando havia catorze pessoas ouvindo, ou quando já tinham sobrado três? O
 * mesmo link no mesmo minuto conta histórias opostas — e hoje a tela não sabe
 * dizer qual delas aconteceu.
 */
export function naSalaEm(
  presencas: readonly { joinedAt: Date; leftAt: Date | null }[],
  instante: Date,
): number {
  return presencas.filter(
    (p) => p.joinedAt <= instante && (!p.leftAt || p.leftAt >= instante),
  ).length;
}

/** Minutos de call até um instante. Negativo vira zero: chat antes de começar. */
export function minutoDaCall(instante: Date, inicio: Date): number {
  return Math.max(0, Math.round((instante.getTime() - inicio.getTime()) / 60_000));
}
