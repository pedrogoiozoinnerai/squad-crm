/**
 * Classifica o motivo de perda do HubSpot no nosso catálogo.
 *
 * Lá o campo é texto livre, e o time escreveu 315 variações para meia dúzia de
 * razões: "Sem retorno", "ghost", "parou de responder", "nao atende telefone".
 * Deixar isso como está transforma a tela "Por que perdemos" em 315 linhas de
 * uma ocorrência cada — precisamente o contrário de um relatório.
 *
 * O texto original NUNCA se perde: ele vai inteiro para `Deal.lostNote`. Esta
 * classificação é uma leitura em cima dele, não um substituto. Quando nada
 * casa, o negócio fica sem motivo estruturado — melhor um buraco honesto do
 * que um motivo inventado que depois vira decisão de produto.
 */
const REGRAS: [RegExp, string][] = [
  [/sem retorno|n[aã]o retorn|ghost|parou de responder|n[aã]o respond|sem resposta|n[aã]o atende|sumiu|n[aã]o deu retorno/i, "Não respondeu"],
  [/sem budget|sem or[çc]amento|sem verba|caro|pre[çc]o|valor alto|acima do esperado|financeiro/i, "Preço acima do esperado"],
  [/n[aã]o [ée] o icp|fora do (perfil|icp)|desqualificad|n[aã]o tem perfil|perfil errado|n[aã]o se encaixa/i, "Sem fit com o produto"],
  [/sem interesse|n[aã]o tem interesse|n[aã]o quis|desistiu|n[aã]o quer/i, "Sem fit com o produto"],
  [/timing|momento|agora n[aã]o|depois|adiou|mais [ap]rente/i, "Timing errado"],
  [/concorren|escolheu outr|foi para (a|o) |contratou outr/i, "Foi para o concorrente"],
  [/decisor|s[oó]cio|dono n[aã]o|quem decide/i, "Decisor não participou"],
];

export function classificarMotivo(texto: string | null | undefined): string | null {
  const limpo = (texto ?? "").trim();
  // "-", ".", "x" e afins são o campo preenchido para fechar o negócio, não um
  // motivo. Tratá-los como motivo criaria uma categoria fantasma no relatório.
  if (limpo.length < 3) return null;
  for (const [padrao, motivo] of REGRAS) if (padrao.test(limpo)) return motivo;
  return null;
}
