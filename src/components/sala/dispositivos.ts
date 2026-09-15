/**
 * Acesso a câmera e microfone, e o que dizer quando dá errado.
 *
 * O navegador devolve um punhado de erros com nomes só compreensíveis para
 * quem escreveu a especificação — `NotAllowedError`, `NotReadableError`. Numa
 * primeira call, o que o vendedor precisa é saber o que CLICAR. Cada mensagem
 * aqui termina numa ação.
 */

export type FalhaDeMidia = {
  /// O que aconteceu, em português e com o próximo passo.
  mensagem: string;
  /// `true` quando adiantar pedir de novo: o usuário pode liberar e repetir.
  podeTentarDeNovo: boolean;
};

export function lerFalha(erro: unknown, oQue: "câmera" | "microfone" | "câmera e microfone"): FalhaDeMidia {
  const nome = (erro as { name?: string } | null)?.name ?? "";

  switch (nome) {
    case "NotAllowedError":
    case "SecurityError":
      return {
        // O cadeado é onde se resolve, e quase ninguém sabe disso.
        mensagem: `Acesso ${oQue === "câmera e microfone" ? "à câmera e ao microfone" : oQue === "câmera" ? "à câmera" : "ao microfone"} negado. Clique no cadeado na barra de endereço e permita.`,
        podeTentarDeNovo: true,
      };
    case "NotFoundError":
    case "OverconstrainedError":
      return {
        mensagem: `Nenhum(a) ${oQue} encontrado(a) neste aparelho. Você ainda pode entrar e participar ouvindo.`,
        podeTentarDeNovo: false,
      };
    case "NotReadableError":
    case "AbortError":
      return {
        // O caso mais comum de todos: o Zoom ou o Meet ficaram abertos atrás.
        mensagem: `Outro programa está usando ${oQue === "câmera e microfone" ? "a câmera ou o microfone" : oQue}. Feche as outras chamadas e tente de novo.`,
        podeTentarDeNovo: true,
      };
    default:
      return {
        mensagem: `Não foi possível acessar ${oQue}. Tente de novo ou entre sem enviar vídeo.`,
        podeTentarDeNovo: true,
      };
  }
}

/** Fecha todas as trilhas — sem isto a luz da câmera fica acesa. */
export function desligar(stream: MediaStream | null) {
  stream?.getTracks().forEach((t) => t.stop());
}
