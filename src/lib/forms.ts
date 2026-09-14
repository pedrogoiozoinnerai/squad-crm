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

export function date(value: FormDataEntryValue | null): Date | null {
  const str = text(value);
  if (!str) return null;
  const parsed = new Date(str);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Telefone em E.164 simplificado: só dígitos, com + na frente. */
export function phone(value: FormDataEntryValue | null): string | null {
  const str = text(value);
  if (!str) return null;
  const digits = str.replace(/\D/g, "");
  if (digits.length < 10) return str;
  return `+${digits.startsWith("55") ? digits : `55${digits}`}`;
}
