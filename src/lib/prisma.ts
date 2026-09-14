import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

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
export const DB_SCHEMA = process.env.DB_SCHEMA ?? "crm";

function createClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL não configurada — veja .env.example.");
  }

  // Runtime usa a URL do pooler (6543). `max: 1` porque cada instância
  // serverless é um processo próprio: pool grande ali multiplica conexões
  // em vez de reaproveitá-las.
  const adapter = new PrismaPg({ connectionString, max: 1 }, { schema: DB_SCHEMA });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
