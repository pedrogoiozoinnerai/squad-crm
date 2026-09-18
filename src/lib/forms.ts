import { instanteDeCampoLocal } from "@/lib/dates";

/** Converte campo de formulário vazio em null, preservando strings reais. */
export function text(value: FormDataEntryValue | null): string | null {
  const str = typeof value === "string" ? value.trim() : "";
  return str === "" ? null : str;
}

export function number(value: FormDataEntryValue | null): number | null {
  const str = text(value);
  if (str === null) return null;
  const parsed = Number(normalizeMoney(str));
  return Number.isFinite(parsed) ? parsed : null;
}

/** "45.360,00" e "45360.00" viram "45360.00". */
function normalizeMoney(str: string) {
  const cleaned = str.replace(/[^\d.,-]/g, "");
  // Sem um dígito sequer, não é número. `Number("")` é 0 e finito, então sem
  // esta linha um valor digitado errado virava R$ 0,00 salvo em silêncio —
  // e o vendedor só descobria ao ver a previsão do mês menor do que deveria.
  if (!/\d/.test(cleaned)) return "não-é-número";
  // Se tem vírgula, ela é o separador decimal (padrão BR) e o ponto é milhar.
  return cleaned.includes(",")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned;
}

/**
 * Dinheiro SEMPRE em centavos inteiros — Float acumula erro de arredondamento.
 * Arredonda no fim para absorver imprecisão de ponto flutuante do parse.
 */
export function moneyCents(value: FormDataEntryValue | null): number | null {
  const str = text(value);
  if (str === null) return null;
  const parsed = Number(normalizeMoney(str));
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed * 100);
}

/**
 * Data e hora de um `<input type="datetime-local">`, no fuso da operação.
 *
 * O campo manda `"2026-10-06T14:00"` SEM fuso, e a especificação manda
 * interpretar isso no relógio de quem executa. Na sua máquina é São Paulo e
 * parece certo; na Vercel é UTC, e as 14:00 viravam 11:00 daqui — o lead
 * recebia o convite com a hora errada e a sala abria três horas antes.
 *
 * O mesmo defeito que a grade de sessões já teve, um andar acima.
 */
export function dataHora(value: FormDataEntryValue | null): Date | null {
  const str = text(value);
  if (!str) return null;
  return instanteDeCampoLocal(str);
}

/**
 * Dia de um `<input type="date">`, como a meia-noite daquele dia AQUI.
 *
 * `new Date("2026-10-06")` é meia-noite UTC — 21:00 do dia 5 em São Paulo. Uma
 * previsão de fechamento marcada para o dia 6 aparecia como dia 5 na tela.
 */
export function dataDoDia(value: FormDataEntryValue | null): Date | null {
  const str = text(value);
  if (!str) return null;
  return instanteDeCampoLocal(`${str}T00:00`);
}

/** Telefone em E.164 simplificado: só dígitos, com + na frente. */
export function phone(value: FormDataEntryValue | null): string | null {
  const str = text(value);
  if (!str) return null;
  const digits = str.replace(/\D/g, "");
  if (digits.length < 10) return str;
  return `+${digits.startsWith("55") ? digits : `55${digits}`}`;
}

/// Os três estados de um negócio, como o schema os define.
export const STATUS_DE_NEGOCIO = ["OPEN", "WON", "LOST"] as const;
export type StatusDeNegocio = (typeof STATUS_DE_NEGOCIO)[number];

/**
 * O status pedido na URL, ou nenhum.
 *
 * Existe porque `filters.status as "OPEN" | "WON" | "LOST"` confiava no que
 * vinha da query string. `?status=open` — minúsculo, que é o que alguém digita
 * — virava `PrismaClientValidationError`: a tela de Negócios trocava por
 * "algo quebrou" e a rota de exportação respondia 500. `prazo` e `ordem`, no
 * mesmo arquivo, já eram validados por `switch` com `default`; só o `status`
 * não era.
 *
 * Devolve `undefined` para valor desconhecido — que é o mesmo que "todos", e é
 * o comportamento certo para um filtro: um recorte que ninguém reconhece não
 * deve derrubar a página, deve não filtrar.
 */
export function statusDeNegocio(valor: string | null | undefined): StatusDeNegocio | undefined {
  const limpo = (valor ?? "").trim().toUpperCase();
  return (STATUS_DE_NEGOCIO as readonly string[]).includes(limpo)
    ? (limpo as StatusDeNegocio)
    : undefined;
}
