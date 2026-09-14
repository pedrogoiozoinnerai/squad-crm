import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { diagnosticarUrlPostgres, env, envObrigatorio, identificador } from "@/lib/env";

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
  const connectionString = envObrigatorio("DATABASE_URL");
  const defeito = diagnosticarUrlPostgres(connectionString);
  if (defeito) throw new Error(`DATABASE_URL inválida: ${defeito}.`);

  // Runtime usa a URL do pooler (6543). `max: 1` porque cada instância
  // serverless é um processo próprio: pool grande ali multiplica conexões
  // em vez de reaproveitá-las.
  const adapter = new PrismaPg({ connectionString, max: 1 }, { schema: DB_SCHEMA });
  return new PrismaClient({ adapter });
}

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
    const value = Reflect.get(getClient(), prop);
    return typeof value === "function" ? value.bind(getClient()) : value;
  },
});
