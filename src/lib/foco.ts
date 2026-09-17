/**
 * Quem aparece grande na sala, e o que é preciso para tomar a tela.
 *
 * O defeito que isto conserta: o quadro principal saía direto de
 * `activeSpeakers` do LiveKit, e `activeSpeakers` muda a cada respiração. Numa
 * sessão com várias pessoas, um "uhum" de meio segundo roubava a tela de quem
 * estava explicando, e a imagem principal piscava de rosto em rosto. Quem
 * assiste não consegue acompanhar nada.
 *
 * A regra é de SUSTENTAÇÃO: para trocar, o candidato precisa segurar a fala por
 * um tempo mínimo e sem interrupção. Interjeição não segura nada, então não
 * troca nada — e quem realmente assume a palavra aparece logo depois de
 * começar a frase.
 *
 * A alternativa que considerei primeiro era de permanência — travar o foco por
 * N segundos DEPOIS de cada troca. Ela limita a piscada, mas não impede o
 * "uhum" de roubar a tela depois de um silêncio, e ainda prende a tela no
 * ladrão pelos N segundos seguintes. Sustentação resolve os dois casos com uma
 * regra só.
 *
 * Puro e sem relógio próprio — o instante entra por parâmetro. É o que permite
 * conferir dois segundos de conversa cruzada sem esperar dois segundos.
 */

/**
 * Quanto tempo o candidato precisa segurar a fala para tomar o quadro.
 *
 * 900ms: abaixo disso uma interjeição já qualifica (foi o que acontecia), e
 * acima de ~1,2s a troca atrasa a ponto de a pessoa já ter dito meia frase
 * antes de aparecer.
 */
export const SUSTENTACAO_MS = 900;

export type EstadoDoFoco = {
  /// Quem está grande agora. `null` antes de a sala ter alguém.
  identidade: string | null;
  /// Quem está tentando tomar o lugar, e desde quando. É o que separa "falou"
  /// de "está falando".
  candidato: { identidade: string; desde: number } | null;
};

export const FOCO_VAZIO: EstadoDoFoco = { identidade: null, candidato: null };

/**
 * O próximo foco, dado quem está falando agora e quem está na sala.
 *
 * Na ordem em que decide:
 *
 * 1. **Quem está em foco saiu** — troca na hora. Esperar sustentação aqui
 *    deixaria um quadro vazio no meio da tela.
 * 2. **Ninguém falando, ou quem fala já está em foco** — não mexe, e zera o
 *    candidato: sustentação interrompida volta à estaca zero, senão duas
 *    interjeições separadas por um minuto somariam como se fossem fala
 *    contínua.
 * 3. **Outro alguém falando** — vira candidato. Troca quando tiver segurado a
 *    fala por `sustentacaoMs` sem parar.
 */
export function proximoFoco(
  estado: EstadoDoFoco,
  entrada: {
    candidato: string | null;
    presentes: readonly string[];
    /// Quem está compartilhando a tela, se alguém.
    compartilhando?: string | null;
  },
  agora: number,
  sustentacaoMs: number = SUSTENTACAO_MS,
): EstadoDoFoco {
  const { candidato, presentes, compartilhando } = entrada;

  // ── Tela compartilhada ganha de tudo ────────────────────────────────────
  //
  // Sem esta regra, compartilhar a tela simplesmente NÃO APARECIA para os
  // outros: o quadro grande seguia a fala, e quem compartilhava não estava
  // necessariamente falando. A tela ia parar na fita lateral, do tamanho de um
  // selo, com o slide ilegível.
  //
  // Vem antes até da saída de quem está em foco, porque quem compartilha está
  // presente por definição — e não tem sustentação: ninguém compartilha tela
  // por engano durante 900ms.
  if (compartilhando && presentes.includes(compartilhando)) {
    return estado.identidade === compartilhando
      ? estado
      : { identidade: compartilhando, candidato: null };
  }

  const aindaEstaAqui = estado.identidade !== null && presentes.includes(estado.identidade);
  if (!aindaEstaAqui) {
    return { identidade: candidato ?? presentes[0] ?? null, candidato: null };
  }

  const valido = candidato && candidato !== estado.identidade && presentes.includes(candidato);
  if (!valido) {
    return estado.candidato === null ? estado : { ...estado, candidato: null };
  }

  if (estado.candidato?.identidade !== candidato) {
    return { ...estado, candidato: { identidade: candidato, desde: agora } };
  }

  if (agora - estado.candidato.desde < sustentacaoMs) return estado;
  return { identidade: candidato, candidato: null };
}

/**
 * Daqui a quanto vale reavaliar, em milissegundos — ou `null` se não há nada
 * pendente.
 *
 * Quem chama reage a eventos, e o evento que faltaria é "o candidato completou
 * a sustentação": ninguém o emite, porque ele é a AUSÊNCIA de evento. Sem este
 * despertador, quem assume a palavra e fala sem parar nunca apareceria — não
 * haveria um segundo `ActiveSpeakersChanged` para disparar a conta.
 */
export function quandoReavaliar(
  estado: EstadoDoFoco,
  agora: number,
  sustentacaoMs: number = SUSTENTACAO_MS,
): number | null {
  if (!estado.candidato) return null;
  return Math.max(0, estado.candidato.desde + sustentacaoMs - agora);
}

/**
 * Quem aparece na fita lateral, dado quem está no quadro grande.
 *
 * A regra parece uma linha e tem uma exceção que custou a câmera de quem
 * apresenta: normalmente o destaque sai da fita, porque ele já está grande e
 * duplicá-lo desperdiça espaço. **Mas quando o quadro grande está mostrando uma
 * TELA compartilhada, ninguém está grande** — a pessoa que compartilha continua
 * devendo um quadro, e sem ele a sala vê os slides e perde o rosto de quem está
 * falando. Quem compartilha, aliás, perde a própria imagem: era esse o defeito.
 */
export function fitaDeQuadros<T extends { identity: string }>(
  todos: readonly T[],
  destaque: { identity: string } | null,
  destaqueEhTela: boolean,
): T[] {
  if (!destaque || destaqueEhTela) return [...todos];
  return todos.filter((p) => p.identity !== destaque.identity);
}
