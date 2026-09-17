/**
 * Remarcar a sessão — as regras, sem banco e sem relógio próprio.
 *
 * A página do convite já oferecia "Remarque aqui" desde sempre, e o link dava
 * 404: a página nunca foi escrita. Quem não podia vir clicava, batia no erro, e
 * o desfecho era o pior dos dois mundos — a pessoa não aparecia E a vaga ficava
 * presa até a hora da sessão, bloqueando alguém que apareceria.
 *
 * Duas decisões moram aqui:
 *
 * **O convite não muda.** Remarcar move a inscrição para outra reunião mantendo
 * o mesmo `inviteToken`, então o link que o lead guardou, o que está no `.ics` e
 * o que ele mandou para um colega continuam valendo. Trocar o token faria a
 * remarcação invalidar exatamente o que a pessoa acabou de salvar.
 *
 * **Sessão que já passou também remarca.** É o caso mais valioso de todos: quem
 * perdeu a sessão de ontem é um lead que já custou o clique inteiro do anúncio,
 * e a única coisa entre ele e uma segunda chance é esta tela.
 */

export type InscricaoParaRemarcar = {
  status: "INSCRITO" | "CONFIRMADO" | "CANCELADO" | string;
  meetingId: string;
};

export type SessaoAlvo = {
  id: string;
  inicioEm: Date;
  vagas: number;
};

/**
 * Por que NÃO dá para remarcar — ou `null` quando dá.
 *
 * Devolve a frase pronta em vez de um código: quem lê é o lead, e cada motivo
 * tem um próximo passo diferente.
 */
export function motivoParaNaoRemarcar(inscricao: InscricaoParaRemarcar): string | null {
  if (inscricao.status === "CANCELADO") {
    return "Este convite foi cancelado. Fale com quem te enviou para receber um novo.";
  }
  return null;
}

/**
 * As sessões para as quais dá para mudar.
 *
 * Tira duas da lista que a agenda oferece:
 *
 * - **a atual**, porque "remarcar para o mesmo horário" é um clique que não faz
 *   nada e ainda gasta uma `versao` do convite de calendário;
 * - **as sem vaga**, porque a lista é lida antes do clique e a sessão pode ter
 *   enchido no meio — mostrar uma opção que vai falhar é pior que não mostrar.
 */
export function alternativas(
  sessoes: readonly SessaoAlvo[],
  inscricao: InscricaoParaRemarcar,
): SessaoAlvo[] {
  return sessoes
    .filter((s) => s.id !== inscricao.meetingId && s.vagas > 0)
    .sort((a, b) => a.inicioEm.getTime() - b.inicioEm.getTime());
}

export type ResultadoDaRemarcacao =
  | { tipo: "ok"; meetingId: string }
  /// A sessão encheu entre a lista e o clique. Corrida normal — a resposta é
  /// recarregar, não um erro.
  | { tipo: "lotada" }
  /// O alvo não existe, já passou ou foi cancelado.
  | { tipo: "indisponivel" }
  | { tipo: "recusado"; motivo: string };

/**
 * O que a tela mostra depois de remarcar.
 *
 * Existe como função para o texto não ser escrito em dois lugares — a página e
 * a mensagem de sucesso diriam coisas ligeiramente diferentes, e "ligeiramente
 * diferente" numa confirmação de horário é onde a pessoa perde a confiança.
 */
export function mensagemDoResultado(r: ResultadoDaRemarcacao): string {
  switch (r.tipo) {
    case "ok":
      return "Pronto, seu horário foi alterado.";
    case "lotada":
      return "Esta sessão encheu enquanto você escolhia. Veja os horários atualizados.";
    case "indisponivel":
      return "Esta sessão não está mais disponível. Escolha outra.";
    case "recusado":
      return r.motivo;
  }
}
