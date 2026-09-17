import type { AbaDaSessao } from "@/lib/queries";

/**
 * A aba pedida na URL, saneada.
 *
 * Existe por um motivo de custo, não de estética: a aba decide se a transcrição
 * de sessenta mil caracteres é sequer consultada. Um `?aba=` inventado cairia
 * no padrão de qualquer jeito, mas deixar isso implícito em três lugares
 * diferentes é como a lista semanal ganhou três cópias da taxa de presença.
 */
export function abaDaSessao(valor: string | string[] | undefined): AbaDaSessao {
  const bruto = Array.isArray(valor) ? valor[0] : valor;
  return bruto === "auditoria" || bruto === "sala" || bruto === "anotacoes" ? bruto : "gravacao";
}
