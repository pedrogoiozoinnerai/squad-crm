import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { diagnosticarUrlPostgres, env, identificador, urlDeConexao } from "@/lib/env";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Os três apps do ecossistema dividem a MESMA instância Postgres (o projeto
 * `master_data` no Supabase), cada um no seu schema. Não é preciosismo: o CRM
 * e o funil têm, os dois, uma tabela `Lead`, com estruturas diferentes — no
 * mesmo schema uma sobrescreveria a outra.
 *
 * `DB_SCHEMA` diz em qual schema este app vive: `crm` em produção,
 * `crm_dev` na máquina. É a mesma variável que o prisma7.config.ts usa
 * para direcionar as migrações.
 */
export const DB_SCHEMA = identificador("DB_SCHEMA", env("DB_SCHEMA", "crm")!);

function createClient() {
  const { url: connectionString, reparado } = urlDeConexao("DATABASE_URL");
  if (!connectionString) throw new Error("DATABASE_URL não configurada — veja .env.example.");
  if (reparado) {
    urlReparada = true;
    console.warn(
      "⚠ DATABASE_URL tinha espaço ou quebra de linha; foi emendada para conectar.\n" +
        "  Corrija o valor no painel: um caractere invisível ali quebra quem mais ler essa variável.",
    );
  }
  const defeito = diagnosticarUrlPostgres(env("DATABASE_URL")!);
  if (defeito) throw new Error(`DATABASE_URL inválida: ${defeito}.`);

  // Runtime usa a URL do pooler (6543). `max: 1` porque cada instância
  // serverless é um processo próprio: pool grande ali multiplica conexões
  // em vez de reaproveitá-las.
  const adapter = new PrismaPg(
    {
      connectionString,
      max: 1,
      // `keepAlive` é o que reduz a causa em vez de remediar o sintoma: sem
      // ele o socket fica parado e o pooler o considera ocioso; o TCP
      // keepalive mantém a conexão viva do outro lado. Não elimina o caso —
      // uma função congelada não manda keepalive nenhum —, mas tira da conta
      // as pausas curtas, que são a maioria.
      keepAlive: true,
      keepAliveInitialDelayMillis: 10_000,
    },
    { schema: DB_SCHEMA },
  );
  return new PrismaClient({ adapter });
}

/**
 * A conexão caiu antes da instrução rodar?
 *
 * O sintoma tem nome em produção: `Connection closed.`, uma das duas únicas
 * assinaturas do `ErrorLog`. A função serverless congela entre invocações com o
 * socket aberto, o pooler derruba a conexão ociosa, e a função descongela em
 * cima de um socket morto. O `idleTimeoutMillis` do `pg` não ajuda porque
 * **timer não roda em função congelada**.
 */
function ehQuedaDeConexao(erro: unknown): boolean {
  const mensagem = erro instanceof Error ? erro.message : String(erro);
  return /Connection closed|Connection terminated|ECONNRESET|EPIPE|server closed the connection/i.test(
    mensagem,
  );
}

/**
 * As operações que dá para repetir sem pensar duas vezes.
 *
 * **Só leitura, de propósito.** Repetir uma escrita exigiria provar que a
 * instrução não chegou ao servidor, e o erro que chega aqui não carrega essa
 * informação — `Connection terminated` tanto pode ser o socket morto antes de
 * enviar quanto o servidor caindo no meio de um `INSERT`. Repetir o segundo
 * caso duplicaria negócio, tarefa ou inscrição. Entre um 500 e um registro
 * duplicado em silêncio, o 500 é o erro mais barato.
 */
const REPETIVEIS = new Set([
  "findMany", "findUnique", "findFirst", "findUniqueOrThrow", "findFirstOrThrow",
  "count", "aggregate", "groupBy",
]);

function comRepeticao<T extends object>(modelo: T): T {
  return new Proxy(modelo, {
    get(alvo, operacao) {
      const original = Reflect.get(alvo, operacao);
      if (typeof original !== "function" || typeof operacao !== "string") return original;
      if (!REPETIVEIS.has(operacao)) return original.bind(alvo);

      return async (...args: unknown[]) => {
        try {
          return await original.apply(alvo, args);
        } catch (erro) {
          if (!ehQuedaDeConexao(erro)) throw erro;
          // Uma vez só. Se a segunda também cair, o problema não é o socket
          // ocioso — é o banco —, e insistir só atrasa a mensagem de erro.
          console.warn(`[prisma] conexão caiu em ${operacao}; repetindo uma vez.`);
          return await original.apply(alvo, args);
        }
      };
    },
  });
}

/** Lido pela rota de saúde: o aviso some do log, o sintoma não. */
export let urlReparada = false;

let client: PrismaClient | undefined;

function getClient(): PrismaClient {
  // Em dev o hot reload reavalia o módulo; sem o globalThis, cada salvamento
  // abriria um pool novo até estourar o limite de conexões do Postgres.
  if (process.env.NODE_ENV !== "production") {
    return (globalForPrisma.prisma ??= createClient());
  }
  return (client ??= createClient());
}

/**
 * O client é criado no PRIMEIRO USO, não na importação do módulo.
 *
 * O `next build` avalia os módulos de rota para coletar metadados das páginas.
 * Se o client nascesse aqui, o build passaria a exigir `DATABASE_URL` — e
 * quebraria em qualquer deploy ou preview sem a variável configurada, num erro
 * que aponta para o Prisma quando o problema é de ambiente. Agora a falta da
 * variável falha no request, com a mensagem certa, e o build segue.
 */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const cliente = getClient();
    const value = Reflect.get(cliente, prop);
    if (typeof value === "function") return value.bind(cliente);
    // Os acessadores de modelo (`prisma.lead`, `prisma.deal`…) ganham a
    // repetição; `$transaction` e `$queryRawUnsafe` não, porque escrevem.
    if (value && typeof value === "object" && typeof prop === "string" && !prop.startsWith("$")) {
      return comRepeticao(value as object);
    }
    return value;
  },
});
