/**
 * De onde veio o lead, segundo o HubSpot.
 *
 * A migração trouxe 8.386 contatos com **zero** UTM. A causa não foi sutil:
 * `PROPS_CONTATO` nunca pediu essas propriedades à API, então elas nunca
 * chegaram.
 *
 * **Esta conta tem duas famílias de UTM, e qual delas vale depende de QUEM se
 * mede.** É a armadilha central deste arquivo, e eu caí nela:
 *
 * | família | portal inteiro | base do Squad |
 * |---|---|---|
 * | `utm_source`, `utm_medium`, `utm_campaign`… | 0% | **45%** |
 * | `utm__first_source`, `utm__first_medium`… | 16% | 1% |
 * | `hs_analytics_source` (nativa) | 100% | 100%, sempre `OFFLINE` |
 *
 * A primeira medição foi nos mil primeiros contatos do portal — que, conferido
 * depois, não têm UM contato em comum com os que a migração trouxe. O portal
 * tem 738 mil contatos de várias operações; a base do Squad são 9 mil, e nela
 * quem está preenchido é a família de nome limpo, com campanha de verdade
 * (`meta`, `ads`, `LEADS_SQUAD-DIAGNOSTICO-3`).
 *
 * Amostra tirada da população errada leva a uma conclusão confiante e errada.
 * Por isso a precedência abaixo aceita as duas famílias em vez de escolher uma:
 * mesmo que a proporção mude, a leitura continua certa.
 *
 * Puro de propósito: a precedência é decisão de produto, e decisão de produto
 * enterrada num laço de importação é decisão que ninguém revisa.
 */

/// As propriedades que a importação precisa PEDIR à API.
///
/// As DUAS famílias, e não a que parecia certa: pedir dez campos a mais custa
/// nada na mesma chamada, e foi escolher uma família sozinha que produziu uma
/// coluna cheia de `offline` onde havia `meta`.
export const PROPS_ATRIBUICAO = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm__first_source",
  "utm__first_medium",
  "utm__first_campaign",
  "utm__first_content",
  "utm__first_keyword",
  "hs_analytics_source",
  "hs_analytics_source_data_1",
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
 * A fonte nativa do HubSpot — que NÃO entra mais em `utmSource`.
 *
 * `hs_analytics_source` é um enum (`PAID_SEARCH`, `OFFLINE`, `DIRECT_TRAFFIC`)
 * e está 100% preenchido, sempre `OFFLINE` nesta base. Eu o usei como reserva
 * de `utmSource` para a coluna não ficar quase vazia, e o tiro saiu pela
 * culatra duas vezes:
 *
 * 1. misturou dois vocabulários na mesma coluna — `meta` e `offline` não são a
 *    mesma espécie de valor;
 * 2. e, como o preenchimento não sobrescreve o que já existe, o `offline` que
 *    escrevi passou a BLOQUEAR o `meta` verdadeiro que faltava importar.
 *
 * Fica exposta para quem quiser a informação noutro lugar, mas `utmSource`
 * volta a significar uma coisa só: a UTM que a pessoa trouxe.
 */
export function fonteNativaDoHubspot(v: unknown): string | null {
  const s = texto(v);
  return s ? s.toLowerCase() : null;
}

/**
 * Lê a atribuição de um contato do HubSpot.
 *
 * As cinco colunas saem das DUAS famílias, com a de nome limpo na frente —
 * é ela que carrega a campanha de verdade na base do Squad (`meta`, `ads`,
 * `LEADS_SQUAD-DIAGNOSTICO-3`). A de primeiro toque entra quando a primeira
 * falta, e cobre os contatos da outra operação.
 *
 * Nada de fonte nativa aqui: `utmSource` significa "a UTM que a pessoa
 * trouxe", e ponto. Quem não veio de campanha fica nulo — que é a verdade, e
 * não atrapalha ninguém.
 *
 * `hs_analytics_source_data_1` também não vira campanha, por mais tentador que
 * seja estar 100% preenchido: o significado dele MUDA conforme o enum — em
 * `PAID_SEARCH` é a campanha, em `OFFLINE` é `IMPORT`. Coluna "campanha" cheia
 * de `IMPORT` é pior que vazia, porque parece dado.
 */
export function lerAtribuicao(props: Record<string, unknown> | null | undefined): Atribuicao {
  if (!props) return VAZIA;

  return {
    utmSource: texto(props.utm_source) ?? texto(props.utm__first_source),
    utmMedium: texto(props.utm_medium) ?? texto(props.utm__first_medium),
    utmCampaign: texto(props.utm_campaign) ?? texto(props.utm__first_campaign),
    utmTerm: texto(props.utm_term) ?? texto(props.utm__first_keyword),
    utmContent: texto(props.utm_content) ?? texto(props.utm__first_content),
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
