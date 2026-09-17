/**
 * De onde veio o lead, segundo o HubSpot.
 *
 * A migração trouxe 8.386 contatos com **zero** UTM. A causa não foi sutil:
 * `PROPS_CONTATO` nunca pediu essas propriedades à API, então elas nunca
 * chegaram. O que veio junto dessa descoberta, porém, muda o conserto.
 *
 * Esta conta tem TRÊS famílias de atribuição, e a mais óbvia é a errada:
 *
 * | família | preenchimento |
 * |---|---|
 * | `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content` | **0%** |
 * | `utm__first_source`, `utm__first_medium`, … (dois sublinhados) | 7% a 16% |
 * | `hs_analytics_source*` (nativa do HubSpot) | 100% |
 *
 * As propriedades de nome limpo existem e estão vazias — alguém as criou e
 * nunca ligou um formulário nelas. Quem mapeasse por nome, sem medir, traria
 * cinco colunas nulas e concluiria que o HubSpot não tem atribuição.
 *
 * **E há um segundo fundo falso.** Amostrando os primeiros mil contatos do
 * portal, 16% têm `utm__first_medium`. Ao preencher os 8.386 que a migração
 * trouxe, o número deu 0,8%. Fui conferir achando que a leitura em lote
 * perdia propriedade — não perde: das 163 pessoas com UTM naquela amostra,
 * ZERO está entre as que importamos. O portal tem muito mais contato do que os
 * oito pipelines do Squad, e os que têm campanha rastreada são de outra
 * operação (as URLs são `platform.innerai.com`). A base do Squad é mesmo quase
 * toda `offline` — lista, importação, cadastro manual. Não é dado que falta:
 * é o que aconteceu.
 *
 * Puro de propósito: a precedência abaixo é uma decisão de produto, e decisão
 * de produto enterrada num laço de importação é decisão que ninguém revisa.
 */

/// As propriedades que a importação precisa PEDIR à API.
///
/// As de nome limpo (`utm_source` e irmãs) ficam de fora de propósito: estão
/// vazias nos 1.000 contatos amostrados, e pedir coluna vazia é gastar limite
/// de API para trazer `null`.
export const PROPS_ATRIBUICAO = [
  "utm__first_source",
  "utm__first_medium",
  "utm__first_campaign",
  "utm__first_content",
  "utm__first_keyword",
  "hs_analytics_source",
  "hs_analytics_source_data_1",
  "hs_analytics_source_data_2",
  "hs_analytics_first_url",
  "hs_analytics_first_referrer",
] as const;

export type Atribuicao = {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmTerm: string | null;
  utmContent: string | null;
};

const VAZIA: Atribuicao = {
  utmSource: null,
  utmMedium: null,
  utmCampaign: null,
  utmTerm: null,
  utmContent: null,
};

/// Valores que CHEGAM como texto e significam ausência.
///
/// Apareceram na conta real: três contatos com a string "null" em
/// `hs_analytics_source`. É o rastro de alguma integração que serializou um
/// nulo em vez de omitir o campo. Sem esta peneira, a tela passaria a mostrar
/// "null" como se fosse uma origem de tráfego.
const FALSOS = new Set(["null", "undefined", "nil", "n/a", "-"]);

/** Texto que vale alguma coisa, ou nulo. */
function texto(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (s === "" || FALSOS.has(s.toLowerCase())) return null;
  return s;
}

/**
 * A fonte nativa do HubSpot, no mesmo vocabulário das UTMs.
 *
 * `hs_analytics_source` é um enum em maiúsculas — `PAID_SEARCH`,
 * `ORGANIC_SEARCH`, `OFFLINE`, `DIRECT_TRAFFIC`. Minúsculo, ele senta ao lado
 * de `google` e `meta` sem que a tela precise saber que vieram de lugares
 * diferentes.
 *
 * `OFFLINE` não é ruído: quer dizer "este contato não veio de tráfego" —
 * importação, lista, cadastro manual. É a resposta certa para 84% desta base, e
 * muito mais útil que `null`, que a tela só sabe mostrar como "sem origem".
 */
function fonteNativa(v: unknown): string | null {
  const s = texto(v);
  return s ? s.toLowerCase() : null;
}

/**
 * Lê a atribuição de um contato do HubSpot.
 *
 * **A precedência de `utmSource`** é a única decisão de verdade aqui: a UTM de
 * primeiro toque vem na frente, e a fonte nativa cobre o resto. Assim a coluna
 * fica COMPLETA em vez de 16% preenchida — e o time consegue perguntar "quantos
 * leads vieram de tráfego pago?" sem que a resposta seja "não dá para saber".
 *
 * As outras quatro NÃO têm equivalente nativo e ficam nulas quando a UTM falta.
 * Seria fácil enfiar `hs_analytics_source_data_1` em `utmCampaign` — ele está
 * 100% preenchido —, mas o significado dele MUDA conforme o enum: em
 * `PAID_SEARCH` é a campanha, em `OFFLINE` é `INTEGRATION`. Uma coluna
 * "campanha" onde a maioria das linhas diz `INTEGRATION` é pior que vazia,
 * porque parece dado.
 */
export function lerAtribuicao(props: Record<string, unknown> | null | undefined): Atribuicao {
  if (!props) return VAZIA;

  return {
    utmSource: texto(props.utm__first_source) ?? fonteNativa(props.hs_analytics_source),
    utmMedium: texto(props.utm__first_medium),
    utmCampaign: texto(props.utm__first_campaign),
    utmTerm: texto(props.utm__first_keyword),
    utmContent: texto(props.utm__first_content),
  };
}

/**
 * O que preencher num lead que JÁ existe.
 *
 * Só o que está faltando: reimportar não pode apagar uma atribuição melhor que
 * tenha chegado por outro caminho — o funil do Type grava a UTM real da sessão,
 * e ela vale mais que a do primeiro toque de um contato antigo do HubSpot.
 *
 * Devolve apenas as chaves a escrever, porque no Prisma `undefined` é "não
 * mexa" e `null` é "apague" — e a diferença entre os dois, aqui, é a diferença
 * entre completar e destruir.
 */
export function apenasOFaltante(
  atual: Partial<Atribuicao>,
  vindoDoHubspot: Atribuicao,
): Partial<Atribuicao> {
  const saida: Partial<Atribuicao> = {};
  for (const chave of Object.keys(vindoDoHubspot) as (keyof Atribuicao)[]) {
    const jaTem = texto(atual[chave]);
    const novo = vindoDoHubspot[chave];
    if (!jaTem && novo) saida[chave] = novo;
  }
  return saida;
}
