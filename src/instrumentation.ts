import type { Instrumentation } from "next";

/**
 * Todo erro de servidor vira registro no banco.
 *
 * O log da Vercel existe, mas ninguém o abre por conta própria — e foi
 * exatamente assim que a produção ficou dias quebrada com um `digest` na tela
 * e nenhuma pista do lado de cá. Guardar o erro na mesma base que o time já
 * usa põe o diagnóstico ao lado do relato.
 *
 * Três cuidados, todos aprendidos aqui:
 *
 * Nada neste arquivo pode lançar. Se o banco for justamente o que está fora do
 * ar, tentar registrar falha também — e um erro dentro do tratador de erro
 * derruba a requisição por um motivo diferente do original.
 *
 * A mensagem é higienizada. Erro de conexão traz a URL do Postgres inteira,
 * com senha, e ela ficaria gravada em texto puro numa tabela que o admin lê.
 *
 * A importação do Prisma é preguiçosa. Este módulo é carregado na subida do
 * servidor, antes das variáveis de ambiente valerem em alguns ambientes.
 *
 * E é guardada por `NEXT_RUNTIME`. Sem essa guarda o empacotador arrasta o
 * Prisma para o pacote do runtime Edge, onde ele não compila — o build
 * avisava "Ecmascript file had an error · Edge Instrumentation" e seguia, o
 * registrador nunca subia, e a tabela de erros ficava vazia justamente quando
 * havia erro. Foi assim que um 500 em produção passou sem deixar rastro.
 */
const SEGREDOS = [
  /postgres(ql)?:\/\/[^@\s]+@/gi, // string de conexão com usuário e senha
  /\b(pat-[a-z0-9-]+)\b/gi, // token do HubSpot
  /Bearer\s+[A-Za-z0-9._-]+/gi,
  /\b[A-Fa-f0-9]{32,}\b/g, // sessão, segredo de cron, hash
];

function higienizar(texto: string) {
  return SEGREDOS.reduce((t, padrao) => t.replace(padrao, "[oculto]"), texto);
}

export const onRequestError: Instrumentation.onRequestError = async (erro, request, context) => {
  // Só no runtime Node: é o único onde o Prisma existe. No Edge esta função
  // ainda roda, e sem a guarda a importação derruba o próprio tratador.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  try {
    const { prisma } = await import("@/lib/prisma");

    const mensagem = higienizar(erro instanceof Error ? erro.message : String(erro)).slice(0, 2000);
    const digest =
      typeof erro === "object" && erro !== null && "digest" in erro
        ? String((erro as { digest: unknown }).digest)
        : null;

    await prisma.errorLog.create({
      data: {
        digest,
        message: mensagem,
        stack: erro instanceof Error && erro.stack ? higienizar(erro.stack).slice(0, 4000) : null,
        path: request.path?.slice(0, 500) ?? null,
        method: request.method ?? null,
        origem: [context.routerKind, context.routeType].filter(Boolean).join(" · ") || null,
      },
    });

    // Poda no próprio caminho de escrita: sem cron nem worker, e um erro em
    // laço encheria a tabela sozinho. Mantém os 500 mais recentes.
    const total = await prisma.errorLog.count();
    if (total > 500) {
      const corte = await prisma.errorLog.findMany({
        select: { id: true },
        orderBy: { createdAt: "desc" },
        skip: 500,
      });
      await prisma.errorLog.deleteMany({ where: { id: { in: corte.map((e) => e.id) } } });
    }
  } catch {
    // De propósito silencioso: já estamos tratando um erro.
  }
};
