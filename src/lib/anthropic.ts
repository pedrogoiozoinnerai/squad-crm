import "server-only";

import {
  contarCriticos,
  contarProibidas,
  lerAnalise,
  montarPrompt,
  type Analise,
} from "@/lib/analise";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import {
  aguardando,
  alvoDaChave,
  arrendar,
  concluir,
  esperandoProvedor,
  falhar,
  rubricaAtiva,
  semearAnalises,
} from "@/lib/trabalhos";

/**
 * A auditoria da call, pedida em lote.
 *
 * Message Batches, e não a API síncrona, por duas razões que se somam: é metade
 * do preço, e o trabalho sai de dentro dos 60 segundos da função — o lote é
 * criado numa execução e colhido na seguinte.
 *
 * **Um lote por call**, e não um lote com todas as pendentes. Parece
 * desperdício e não é: com 12,5 calls por dia o ganho de agrupar é zero, e o
 * custo de agrupar é real — o `externoId` passaria a ser compartilhado por N
 * trabalhos, uma falha do lote derrubaria todos juntos, e o código que
 * reconcilia "qual resultado é de qual call" é exatamente onde esse tipo de
 * coisa costuma errar em silêncio.
 */

const VERSAO_API = "2023-06-01";

export function chaveDaAnthropic() {
  return env("ANTHROPIC_API_KEY") ?? null;
}

export function anthropicConfigurado() {
  return chaveDaAnthropic() !== null;
}

/// O modelo. Sonnet 5 por volume: são 12,5 auditorias por dia sobre
/// transcrições de sessenta mil caracteres, e a régua é um playbook explícito —
/// não um julgamento aberto. Trocável sem tocar no código.
export const MODELO_PADRAO = "claude-sonnet-5";

/// Teto de saída. O schema da análise tem blocos, erros, vocabulário, objeções
/// e scorecard: cortar no meio produz JSON inválido, que vira "falhou na
/// validação" para uma análise que estava certa.
const MAX_TOKENS = 8000;

/// Quantas transcrições mandar por execução, e quantos lotes colher.
const POR_EXECUCAO = 6;

export type RelatorioDeAnalise = {
  semeados: number;
  enviados: number;
  colhidos: number;
  falhas: number;
};

async function chamar(caminho: string, init?: RequestInit) {
  const chave = chaveDaAnthropic();
  if (!chave) throw new Error("Anthropic não configurada.");
  return fetch(`https://api.anthropic.com${caminho}`, {
    ...init,
    headers: {
      "x-api-key": chave,
      "anthropic-version": VERSAO_API,
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
    signal: AbortSignal.timeout(30_000),
  });
}

/** Manda para o lote o que ainda não foi analisado. */
export async function pedirAnalises(): Promise<RelatorioDeAnalise> {
  const relatorio: RelatorioDeAnalise = { semeados: 0, enviados: 0, colhidos: 0, falhas: 0 };
  if (!anthropicConfigurado()) return relatorio;

  const rubrica = await rubricaAtiva();
  // Sem régua não há auditoria. Analisar sem rubrica produziria uma opinião
  // genérica sobre a call — pior que nenhuma análise, porque parece uma e o
  // closer age em cima dela.
  if (!rubrica) return relatorio;

  relatorio.semeados = await semearAnalises();
  const modelo = env("ANTHROPIC_MODEL", MODELO_PADRAO)!;

  for (const trabalho of await arrendar("ANALISAR", POR_EXECUCAO)) {
    const transcricao = await prisma.transcript.findUnique({
      where: { id: alvoDaChave(trabalho.chave) },
      select: { texto: true },
    });
    if (!transcricao?.texto) {
      await falhar(trabalho.id, Number.MAX_SAFE_INTEGER, "a transcrição não existe mais");
      relatorio.falhas += 1;
      continue;
    }

    try {
      const resposta = await chamar("/v1/messages/batches", {
        method: "POST",
        body: JSON.stringify({
          requests: [
            {
              custom_id: trabalho.id,
              params: {
                model: modelo,
                max_tokens: MAX_TOKENS,
                messages: [
                  // A rubrica é do operador; o contrato de saída é gerado do
                  // Zod pelo código. É isso que impede o erro da referência,
                  // onde o prompt pede dezenas de campos e o schema aceita
                  // cinco — e a maior parte da análise é paga e descartada.
                  { role: "user", content: montarPrompt(rubrica.corpo, transcricao.texto) },
                ],
              },
            },
          ],
        }),
      });

      if (!resposta.ok) {
        const detalhe = await resposta.text().catch(() => "");
        await falhar(trabalho.id, trabalho.tentativas, `anthropic ${resposta.status}: ${detalhe.slice(0, 200)}`);
        relatorio.falhas += 1;
        continue;
      }

      const corpo = (await resposta.json()) as { id?: string };
      if (!corpo.id) {
        await falhar(trabalho.id, trabalho.tentativas, "lote aceito sem id");
        relatorio.falhas += 1;
        continue;
      }

      await aguardando(trabalho.id, corpo.id);
      relatorio.enviados += 1;
    } catch (erro) {
      await falhar(trabalho.id, trabalho.tentativas, erro instanceof Error ? erro.message : "falha desconhecida");
      relatorio.falhas += 1;
    }
  }

  return relatorio;
}

/**
 * Colhe os lotes que já terminaram.
 *
 * Diferente da transcrição, aqui não há callback: a Anthropic não avisa quando
 * o lote fica pronto, então somos nós que perguntamos. O que salva o trabalho de
 * ficar esperando para sempre é o mesmo `soltarEsquecidos` da outra etapa.
 */
export async function colherAnalises(): Promise<number> {
  if (!anthropicConfigurado()) return 0;

  const rubrica = await rubricaAtiva();
  let colhidos = 0;

  for (const trabalho of await esperandoProvedor("ANALISAR", POR_EXECUCAO)) {
    try {
      const estado = await chamar(`/v1/messages/batches/${trabalho.externoId}`);
      if (!estado.ok) continue;

      const lote = (await estado.json()) as {
        processing_status?: string;
        results_url?: string | null;
      };
      // `ended` é o único estado terminal. Enquanto for `in_progress`, não há
      // nada a fazer — e insistir custa uma chamada por execução, não mais.
      if (lote.processing_status !== "ended" || !lote.results_url) continue;

      const resultados = await fetch(lote.results_url, {
        headers: { "x-api-key": chaveDaAnthropic()!, "anthropic-version": VERSAO_API },
        signal: AbortSignal.timeout(30_000),
      });
      if (!resultados.ok) continue;

      // JSONL: uma linha por pedido. Com um pedido por lote, é uma linha só —
      // mas ler como JSONL é o que faz isto continuar funcionando se um dia o
      // lote crescer.
      const linhas = (await resultados.text()).split("\n").filter((l) => l.trim());
      let gravou = false;

      for (const linha of linhas) {
        const item = JSON.parse(linha) as {
          custom_id?: string;
          result?: { type?: string; message?: { content?: { type?: string; text?: string }[]; model?: string } };
        };
        if (item.custom_id !== trabalho.id) continue;

        if (item.result?.type !== "succeeded") {
          await falhar(trabalho.id, trabalho.tentativas, `lote devolveu ${item.result?.type ?? "sem tipo"}`);
          gravou = true;
          break;
        }

        const texto = item.result.message?.content?.find((p) => p.type === "text")?.text ?? "";
        await guardarAnalise(
          alvoDaChave(trabalho.chave),
          texto,
          item.result.message?.model ?? null,
          rubrica?.id ?? null,
        );
        await concluir(trabalho.id);
        colhidos += 1;
        gravou = true;
        break;
      }

      if (!gravou) {
        await falhar(trabalho.id, trabalho.tentativas, "o lote terminou sem resultado para este pedido");
      }
    } catch (erro) {
      console.error(`[anthropic] colher ${trabalho.id} falhou:`, erro);
    }
  }

  return colhidos;
}

/**
 * Grava a análise, mesmo quando ela não passa na validação.
 *
 * `bruto` é o que o modelo respondeu, sempre. Sem ele, "falhou na validação" é
 * beco sem saída: não dá para ver o que ele disse, não dá para consertar o
 * schema, e a única saída é pagar de novo pela mesma análise.
 */
async function guardarAnalise(
  transcriptId: string,
  texto: string,
  modelo: string | null,
  promptId: string | null,
) {
  const cru = extrairJson(texto);
  const leitura = lerAnalise(cru);

  if (!leitura.ok) {
    console.error(`[anthropic] análise fora do contrato (${transcriptId}): ${leitura.problema}`);
    await prisma.callAnalysis.upsert({
      where: { transcriptId },
      create: {
        transcriptId,
        promptId,
        modelo,
        resumo: `A análise não pôde ser lida: ${leitura.problema}`,
        bruto: (cru ?? texto) as object,
      },
      update: { bruto: (cru ?? texto) as object },
    });
    return;
  }

  const a: Analise = leitura.analise;
  const dados = {
    promptId,
    modelo,
    resumo: a.resumo,
    veredicto: a.veredicto,
    aderenciaPct: a.aderenciaPct,
    notaGeral: a.notaGeral,
    engajamento: a.engajamento,
    blocosOk: a.blocos.filter((b) => b.status === "OK").length,
    blocosTotal: a.blocos.length,
    // Conta TODOS os críticos, inclusive os sem citação, que a tela não
    // desenha. Filtrar a tela não pode falsear o número: a coluna diz quantos
    // houve, não quantos couberam.
    errosCriticos: contarCriticos(a.erros),
    proibidasCount: contarProibidas(a.vocabulario),
    roleplayFoco: a.roleplayFoco,
    blocos: a.blocos,
    erros: a.erros,
    vocabulario: a.vocabulario,
    objecoes: a.objecoes,
    scorecard: a.scorecard,
    insights: a.insights,
    proximosPassos: a.proximosPassos,
    bruto: cru as object,
  };

  await prisma.callAnalysis.upsert({
    where: { transcriptId },
    create: { transcriptId, ...dados },
    update: dados,
  });
}

/**
 * O JSON dentro da resposta.
 *
 * O contrato pede JSON puro, sem cercas de código. Modelos obedecem quase
 * sempre — e "quase" aqui custa uma análise inteira já paga, então o recorte
 * entre a primeira chave e a última é barato demais para não fazer.
 */
export function extrairJson(texto: string): unknown {
  const limpo = texto.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try {
    return JSON.parse(limpo);
  } catch {
    const inicio = limpo.indexOf("{");
    const fim = limpo.lastIndexOf("}");
    if (inicio < 0 || fim <= inicio) return null;
    try {
      return JSON.parse(limpo.slice(inicio, fim + 1));
    } catch {
      return null;
    }
  }
}
