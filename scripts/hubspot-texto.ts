/**
 * Limpeza do texto que vem do HubSpot.
 *
 * Em arquivo próprio para poder ser testado: o importador executa `main()` ao
 * ser importado, então qualquer coisa que more lá dentro só se testa rodando
 * uma migração inteira contra a API.
 */

/** O corpo da anotação vem como HTML do editor do HubSpot. */
export const texto = (html: string | null | undefined) =>
  (html ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();

/**
 * Nome de pessoa como ele deveria ter sido digitado.
 *
 * Muita gente no HubSpot tem sobrenome "." ou "-", resquício de importação
 * anterior ou de formulário que exigia o campo. Sem limpar, a lista de leads
 * fica cheia de "Juciele ." e ninguém entende se é erro nosso.
 */
export function nomeLimpo(valor: string) {
  return valor
    .replace(/\s+/g, " ")
    .replace(/(^|\s)[.\-_]+(?=\s|$)/g, "")
    .trim();
}
