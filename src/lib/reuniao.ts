/**
 * As regras de uma reunião, puras.
 *
 * Separadas da Server Action pelo mesmo motivo que `escopo.ts` é separado de
 * `auth.ts`: a ação importa `server-only` e o Prisma, e não pode ser carregada
 * num teste. Aqui não há nem um nem outro, então cada regra é verificável.
 */

/// Duração mínima e máxima de uma reunião, em minutos.
///
/// Cinco minutos porque existe call de alinhamento; oito horas porque acima
/// disso é agenda do dia inteiro, não reunião — e um campo livre sem teto vira
/// uma sala aberta a noite toda quando alguém erra um dígito.
export const DURACAO_MIN = 5;
export const DURACAO_MAX = 480;

/// De quanto em quanto a duração anda. Meia hora e 45 min são o comum; 5
/// minutos deixa marcar 20 ou 50 sem inventar uma lista fechada.
const PASSO = 5;

/// Lotação padrão de uma reunião em grupo, igual ao padrão da série.
export const LOTACAO_PADRAO = 20;
export const LOTACAO_MAX = 500;

export type TipoDeReuniao = "GROUP" | "ONE_ON_ONE";

/**
 * A duração em minutos, ou `null` se o valor não serve.
 *
 * Devolver `null` e não um padrão é a diferença que importa: a lista fechada
 * anterior (`[30,45,60,90]`) transformava qualquer valor fora dela em 30
 * minutos **em silêncio** — quem digitasse 120 saía com uma reunião de meia
 * hora e só descobriria na hora da call.
 */
export function duracaoValida(bruto: FormDataEntryValue | null): number | null {
  const n = Number(String(bruto ?? "").trim());
  if (!Number.isInteger(n)) return null;
  if (n < DURACAO_MIN || n > DURACAO_MAX) return null;
  if (n % PASSO !== 0) return null;
  return n;
}

/** O tipo da reunião. Só `GROUP` é explícito; qualquer outra coisa é 1:1. */
export function tipoDeReuniao(bruto: FormDataEntryValue | null): TipoDeReuniao {
  return String(bruto ?? "") === "GROUP" ? "GROUP" : "ONE_ON_ONE";
}

/**
 * A lotação, que só existe em grupo.
 *
 * Em 1:1 devolve `null`, que é o que o schema declara ("nulo = sem limite, que
 * é o caso de toda 1:1").
 *
 * Em grupo NUNCA devolve nulo — e é esse o conserto. `scheduleMeeting` jamais
 * gravava `capacity`, então uma reunião em grupo criada à mão nascia com
 * lotação nula e ficava **invisível** para a API de disponibilidade, que
 * filtra `capacity: { not: null }`. Ninguém via, porque a reunião aparecia
 * normalmente na agenda do vendedor.
 */
export function lotacaoValida(
  bruto: FormDataEntryValue | null,
  tipo: TipoDeReuniao,
): number | null | "invalida" {
  if (tipo !== "GROUP") return null;

  const texto = String(bruto ?? "").trim();
  if (texto === "") return LOTACAO_PADRAO;

  const n = Number(texto);
  if (!Number.isInteger(n) || n < 1 || n > LOTACAO_MAX) return "invalida";
  return n;
}

export type Intervalo = { inicio: Date; fim: Date };

/**
 * Dois intervalos se sobrepõem?
 *
 * Extremos que se tocam NÃO se sobrepõem: uma reunião das 14:00 às 15:00 e
 * outra das 15:00 às 16:00 são consecutivas, não conflitantes — e avisar de
 * conflito aí faria o vendedor ignorar o aviso de vez.
 */
export function sobrepoe(a: Intervalo, b: Intervalo): boolean {
  return a.inicio < b.fim && b.inicio < a.fim;
}

/** O fim de uma reunião a partir do início e da duração. */
export function fimDaReuniao(inicio: Date, duracaoMin: number): Date {
  return new Date(inicio.getTime() + duracaoMin * 60_000);
}
