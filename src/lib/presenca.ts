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
    { name: string | null; joinedAt: Date | null; leftAt: Date | null; seconds: number; aberto: Date | null }
  >();

  for (const evento of ordenados) {
    if (!evento.identity) continue;
    if (evento.type !== "participant_joined" && evento.type !== "participant_left") continue;

    const atual = porIdentidade.get(evento.identity) ?? {
      name: null,
      joinedAt: null,
      leftAt: null,
      seconds: 0,
      aberto: null,
    };
    if (evento.name) atual.name = evento.name;

    if (evento.type === "participant_joined") {
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

    consolidadas.push({ identity, name: dados.name, joinedAt: dados.joinedAt, leftAt, seconds });
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
