/**
 * Por que a sala não abriu, dito para quem vai entrar nela.
 *
 * O LiveKit devolve mensagens escritas para quem depura WebRTC: "could not
 * establish pc connection", "client initiated disconnect". Um lead que chegou
 * ao fim do funil e clicou em entrar lê isso e não tem o que fazer com a
 * informação — nem sequer está em português.
 *
 * Mesma ideia de `dispositivos.ts`, um andar acima: lá é o navegador negando
 * câmera, aqui é a conexão não fechando. As duas terminam numa AÇÃO.
 *
 * Puro de propósito — sem React e sem rede — para os casos serem conferíveis
 * sem subir sala nenhuma.
 */

export type FalhaDaSala = {
  /// Uma frase, em português, dizendo o que aconteceu.
  titulo: string;
  /// O próximo passo concreto. Vazio quando não há nada a fazer além de avisar.
  acao: string;
  /// Vale oferecer o botão de tentar de novo?
  podeTentarDeNovo: boolean;
};

/// Trechos que o LiveKit e o navegador usam, e o que cada um significa de
/// verdade para quem está tentando entrar.
const CATALOGO: { casa: RegExp; falha: FalhaDaSala }[] = [
  {
    // O mais comum em rede corporativa e VPN: o WebRTC precisa de UDP e o
    // firewall só deixa passar HTTP.
    casa: /could not establish pc connection|ice connection|peerconnection|pc connection/i,
    falha: {
      titulo: "Não conseguimos completar a conexão de vídeo.",
      acao:
        "Costuma ser rede corporativa ou VPN bloqueando. Tente desligar a VPN, " +
        "usar outra rede (o 4G do celular resolve quase sempre) e entrar de novo.",
      podeTentarDeNovo: true,
    },
  },
  {
    casa: /server is full|room is full|maximum participants/i,
    falha: {
      titulo: "Esta sala já está cheia.",
      acao: "Fale com quem te enviou o convite para abrir uma sessão adicional.",
      podeTentarDeNovo: false,
    },
  },
  {
    // Token vencido: a janela da sala fecha, e o token é curto de propósito.
    casa: /invalid token|token expired|unauthorized|permission denied/i,
    falha: {
      titulo: "Seu acesso a esta sala expirou.",
      acao: "Recarregue a página para pegar um acesso novo.",
      podeTentarDeNovo: true,
    },
  },
  {
    casa: /websocket|failed to connect|network error|load failed|fetch/i,
    falha: {
      titulo: "A conexão caiu no caminho.",
      acao: "Confira sua internet e tente de novo.",
      podeTentarDeNovo: true,
    },
  },
  {
    casa: /client initiated disconnect|disconnected/i,
    falha: {
      titulo: "A conexão com a sala foi encerrada.",
      acao: "Se não foi você quem saiu, entre de novo.",
      podeTentarDeNovo: true,
    },
  },
  {
    casa: /duplicate identity/i,
    falha: {
      titulo: "Esta sala já está aberta em outra aba.",
      acao: "Feche a outra aba e entre de novo — dá para estar em uma de cada vez.",
      podeTentarDeNovo: true,
    },
  },
];

/// O que dizer quando não reconhecemos o erro.
///
/// Sem mensagem crua: um texto em inglês vindo da biblioteca não ajuda quem lê
/// e ainda passa a impressão de que o sistema quebrou por dentro. O detalhe
/// técnico fica no console para quem for investigar.
const DESCONHECIDA: FalhaDaSala = {
  titulo: "Não foi possível entrar na sala agora.",
  acao: "Tente de novo. Se continuar, avise quem te enviou o convite.",
  podeTentarDeNovo: true,
};

/**
 * De onde veio o erro.
 *
 * Quem chama SABE a origem — a resposta da nossa rota de token é uma coisa, a
 * exceção do `livekit-client` é outra. Dizer é melhor que adivinhar: a primeira
 * versão tentava reconhecer a nossa mensagem farejando acentos, o que é um
 * palpite que erra nos dois sentidos (um erro em inglês nosso vira catálogo, e
 * "coisa que ninguém previu" vira passe livre).
 */
export type OrigemDaFalha =
  /// Resposta da nossa API: já vem em português e com a razão exata
  /// ("Esta reunião foi cancelada"). Reescrever perderia precisão.
  | "api"
  /// Exceção do `livekit-client` ou do WebRTC: escrita para quem depura.
  | "conexao";

export function lerFalhaDaSala(erro: unknown, origem: OrigemDaFalha = "conexao"): FalhaDaSala {
  const mensagem = erro instanceof Error ? erro.message : typeof erro === "string" ? erro : "";
  if (!mensagem.trim()) return DESCONHECIDA;

  if (origem === "api") return { titulo: mensagem, acao: "", podeTentarDeNovo: true };

  // Para o catálogo, o nome ajuda: `NotAllowedError` e afins vêm ali.
  const paraCasar = erro instanceof Error ? `${erro.name} ${erro.message}` : mensagem;
  for (const { casa, falha } of CATALOGO) {
    if (casa.test(paraCasar)) return falha;
  }
  return DESCONHECIDA;
}
