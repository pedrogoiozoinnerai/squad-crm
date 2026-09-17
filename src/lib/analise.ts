import { z } from "zod";

/**
 * O contrato da auditoria de call.
 *
 * Este arquivo É o contrato — não uma validação depois do fato. O prompt pede
 * exatamente a forma descrita aqui, porque o texto do formato é GERADO daqui;
 * e a resposta é lida por este mesmo schema. Um campo novo entra num lugar só.
 *
 * O motivo é um erro concreto e documentado do CRM de referência: lá o prompt
 * tem 13.605 caracteres pedindo dezenas de campos, e o schema que lê a resposta
 * aceita cinco. O modelo produz a análise inteira, alguém paga por ela, e a
 * maior parte é descartada em silêncio — ninguém descobre, porque o que sobra
 * parece completo.
 *
 * Por isso a rubrica que o operador escreve (`AiPrompt.corpo`) é SÓ a régua de
 * julgamento. O formato ele não alcança.
 */

export const GRAVIDADES = ["CRITICO", "MEDIO", "LEVE"] as const;
export const VEREDICTOS = ["EXCELENTE", "BOA", "MEDIANA", "FRACA"] as const;

const BlocoSchema = z.object({
  nome: z.string().describe("O bloco do playbook, no nome que o playbook usa."),
  status: z.enum(["OK", "PARCIAL", "AUSENTE"]),
  minutos: z.number().min(0).nullable().default(null).describe("Quanto durou, em minutos."),
  comecaEmSegundos: z
    .number()
    .min(0)
    .nullable()
    .default(null)
    .describe("Em que segundo da gravação este bloco começa. É o que faz clicar saltar o vídeo."),
  observacao: z.string().nullable().default(null),
});

const ErroSchema = z.object({
  bloco: z.string().nullable().default(null),
  gravidade: z.enum(GRAVIDADES),
  oQueAconteceu: z.string(),
  /// A frase literal da transcrição. Sem ela o erro não é DESENHADO — ver
  /// `errosVisiveis`. "Sem citação não há acusação" é regra de renderização,
  /// não de boa vontade.
  citacao: z.string().nullable().default(null),
  oQuePlaybookManda: z.string().nullable().default(null),
  emSegundos: z.number().min(0).nullable().default(null),
});

const TermoSchema = z.object({
  termo: z.string(),
  tipo: z.enum(["PROIBIDO", "RECOMENDADO"]),
  ocorrencias: z.number().int().min(0).default(0),
  emSegundos: z.number().min(0).nullable().default(null),
});

const ObjecaoSchema = z.object({
  objecao: z.string(),
  comoFoiTratada: z.string().nullable().default(null),
  resolvida: z.boolean().nullable().default(null),
  citacao: z.string().nullable().default(null),
  emSegundos: z.number().min(0).nullable().default(null),
});

const ItemDoScorecardSchema = z.object({
  criterio: z.string(),
  nota: z.number().min(0).max(10),
  justificativa: z.string().nullable().default(null),
});

/// Quantos insights a tela mostra. Três: o closer acabou de sair de uma call e
/// vai entrar em outra. Uma lista de doze é a mesma coisa que nenhuma.
export const INSIGHTS_VISIVEIS = 3;

/// Quantos erros a tela mostra. Também três, e pelo mesmo motivo — mas aqui há
/// um segundo: uma tela com onze erros é um paredão, e um paredão faz o closer
/// parar de abrir a página. O que não cabe fica no scorecard, atrás do
/// `<details>`.
export const ERROS_VISIVEIS = 3;

export const AnaliseSchema = z.object({
  resumo: z.string().describe("O que aconteceu na call, em 3 a 5 frases. Fato, não julgamento."),
  veredicto: z.enum(VEREDICTOS),
  aderenciaPct: z.number().int().min(0).max(100).nullable().default(null),
  notaGeral: z.number().min(0).max(10).nullable().default(null),
  engajamento: z
    .number()
    .min(0)
    .max(10)
    .nullable()
    .default(null)
    .describe("Quanto a sala participou: perguntas, respostas, câmeras."),
  blocos: z.array(BlocoSchema).default([]),
  erros: z.array(ErroSchema).default([]),
  vocabulario: z.array(TermoSchema).default([]),
  objecoes: z.array(ObjecaoSchema).default([]),
  scorecard: z.array(ItemDoScorecardSchema).default([]),
  insights: z
    .array(z.string())
    .default([])
    .describe("O que fazer por causa desta call. Ações, não elogios."),
  proximosPassos: z.array(z.string()).default([]),
  roleplayFoco: z
    .array(z.string())
    .default([])
    .describe("Em que treinar. Nomes curtos e repetíveis, para agrupar entre calls."),
});

export type Analise = z.infer<typeof AnaliseSchema>;
export type ErroDaCall = z.infer<typeof ErroSchema>;
export type Bloco = z.infer<typeof BlocoSchema>;
export type Termo = z.infer<typeof TermoSchema>;
export type Objecao = z.infer<typeof ObjecaoSchema>;
export type ItemDoScorecard = z.infer<typeof ItemDoScorecardSchema>;

/**
 * Os campos `jsonb` de volta do banco.
 *
 * O que está gravado lá foi escrito por uma versão anterior deste schema. Lê-lo
 * sem validar é como a página de uma call inteira cai por um campo que mudou de
 * nome há três meses — levando junto a presença, que não tem nada a ver com a
 * análise. Cada leitor devolve lista vazia quando não reconhece a forma, e a
 * tela simplesmente não desenha aquele bloco.
 */
function lista<T>(esquema: z.ZodType<T>) {
  return (bruto: unknown): T[] => {
    const r = z.array(esquema).safeParse(bruto);
    return r.success ? r.data : [];
  };
}

export const lerBlocos = lista(BlocoSchema);
export const lerErros = lista(ErroSchema);
export const lerVocabulario = lista(TermoSchema);
export const lerObjecoes = lista(ObjecaoSchema);
export const lerScorecard = lista(ItemDoScorecardSchema);
export const lerTextos = lista(z.string());

/**
 * Os erros que a tela pode desenhar.
 *
 * **Erro sem citação não aparece.** É a regra mais importante desta tela: o que
 * está sendo dito é que uma pessoa conduziu mal uma conversa, e isso é lido
 * pelo gestor dela. Uma acusação que o modelo não consegue ancorar numa frase
 * literal da transcrição é exatamente a que não se pode fazer — e filtrar aqui
 * é mais honesto do que pedir ao modelo que não invente.
 *
 * O que foi filtrado continua em `CallAnalysis.bruto`: a contagem de críticos
 * não muda, então o número da lista continua verdadeiro.
 */
export function errosVisiveis(erros: ErroDaCall[], teto = ERROS_VISIVEIS): ErroDaCall[] {
  const ordem = { CRITICO: 0, MEDIO: 1, LEVE: 2 } as const;
  return erros
    .filter((e) => (e.citacao ?? "").trim().length > 0)
    .sort((a, b) => ordem[a.gravidade] - ordem[b.gravidade])
    .slice(0, teto);
}

export function contarCriticos(erros: ErroDaCall[]): number {
  return erros.filter((e) => e.gravidade === "CRITICO").length;
}

export function contarProibidas(vocabulario: Analise["vocabulario"]): number {
  return vocabulario
    .filter((t) => t.tipo === "PROIBIDO")
    .reduce((soma, t) => soma + t.ocorrencias, 0);
}

export type LeituraDaAnalise =
  | { ok: true; analise: Analise }
  | { ok: false; problema: string };

/**
 * Lê a resposta do modelo.
 *
 * Nunca lança. Uma análise malformada não pode derrubar o trabalho que a pediu
 * — o áudio já foi transcrito, o modelo já foi pago, e perder tudo isso por um
 * campo a menos seria jogar fora o caro para punir o barato. Quem chama guarda
 * o `bruto` de qualquer forma.
 */
export function lerAnalise(bruto: unknown): LeituraDaAnalise {
  const r = AnaliseSchema.safeParse(bruto);
  if (r.success) return { ok: true, analise: r.data };
  const primeiro = r.error.issues[0];
  return {
    ok: false,
    problema: primeiro
      ? `${primeiro.path.join(".") || "(raiz)"}: ${primeiro.message}`
      : "resposta em formato desconhecido",
  };
}

/**
 * O formato de saída, escrito a partir do schema.
 *
 * Anexado ao prompt pelo código, depois da rubrica. É este trecho — e não a
 * rubrica — que garante que tudo que o modelo produz tem onde ser guardado.
 */
export function contratoDeSaida(): string {
  const esquema = z.toJSONSchema(AnaliseSchema, { io: "input" });
  return [
    "Responda SOMENTE com um objeto JSON válido, sem cercas de código e sem texto antes ou depois.",
    "O objeto precisa seguir exatamente este JSON Schema:",
    JSON.stringify(esquema, null, 2),
    "Toda citação precisa ser a frase LITERAL da transcrição. Se não houver frase literal que sustente um apontamento, deixe `citacao` nula — o apontamento sem citação não é mostrado a ninguém.",
  ].join("\n\n");
}

/// O que a rubrica NÃO pode tentar fazer.
///
/// Se o operador escrever "responda em markdown" no corpo, ele passa a disputar
/// o formato com o contrato gerado — e o empate é resolvido pelo modelo, não
/// por nós. O resultado é uma análise que falha na leitura sem que ninguém
/// entenda por quê, porque a rubrica "está certa".
const FORMATO_NA_RUBRICA =
  /\bresponda\s+(em|com|apenas em|somente em)\s+(json|markdown|texto|tabela|xml)\b/i;

export type RubricaInvalida = { motivo: string } | null;

export function problemaNaRubrica(corpo: string): RubricaInvalida {
  const limpo = corpo.trim();
  if (limpo.length < 50) {
    return { motivo: "A rubrica está curta demais para julgar uma call — escreva a régua inteira." };
  }
  if (FORMATO_NA_RUBRICA.test(limpo)) {
    return {
      motivo:
        "A rubrica não define o formato da resposta: isso é gerado do schema e anexado automaticamente. Descreva só a régua de julgamento.",
    };
  }
  return null;
}

/** A rubrica do operador mais o contrato que o código anexa. */
export function montarPrompt(rubrica: string, transcricao: string): string {
  return [
    rubrica.trim(),
    contratoDeSaida(),
    "Transcrição da call:",
    transcricao,
  ].join("\n\n---\n\n");
}

/// O que fica no lugar de uma citação apagada.
///
/// Um marcador, e não string vazia: vazio faria o erro sumir da tela (a regra é
/// "sem citação não desenha") e a call pareceria limpa. O apontamento continua,
/// dizendo que a prova foi removida pelo prazo — o que é a verdade.
export const CITACAO_REMOVIDA = "[trecho removido pela retenção]";

/**
 * Tira as falas literais, mantendo os números.
 *
 * É o que permite a retenção apagar o CONTEÚDO da conversa de um cliente sem
 * apagar o histórico de desempenho do time: a nota de fechamento de julho
 * continua comparável com a de agosto, e ninguém consegue mais ler o que o
 * cliente disse.
 */
export function redigirErros(erros: ErroDaCall[]): ErroDaCall[] {
  return erros.map((e) => ({
    ...e,
    citacao: e.citacao ? CITACAO_REMOVIDA : null,
    // O "o que aconteceu" é descrição nossa, não fala de ninguém — fica.
    // `oQuePlaybookManda` é o nosso próprio playbook — fica também.
  }));
}

export function redigirObjecoes(objecoes: Objecao[]): Objecao[] {
  return objecoes.map((o) => ({ ...o, citacao: o.citacao ? CITACAO_REMOVIDA : null }));
}

/**
 * Passou do prazo?
 *
 * `dias <= 0` significa **guardar para sempre**, e é o padrão. Não é descuido: o
 * prazo de guarda é decisão de quem responde por privacidade, e apagar material
 * de vendas por omissão seria pior que qualquer atraso em decidir.
 */
export function venceu(quando: Date, dias: number, agora: Date): boolean {
  if (dias <= 0) return false;
  return agora.getTime() - quando.getTime() > dias * 24 * 60 * 60_000;
}
