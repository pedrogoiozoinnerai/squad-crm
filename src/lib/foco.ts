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
  entrada: { candidato: string | null; presentes: readonly string[] },
  agora: number,
  sustentacaoMs: number = SUSTENTACAO_MS,
): EstadoDoFoco {
  const { candidato, presentes } = entrada;

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
