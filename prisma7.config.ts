import "dotenv/config";
import { defineConfig } from "prisma/config";
import { env, identificador } from "./src/lib/env";

/**
 * A migração roda na conexão DIRETA (5432): o pooler em modo transaction não
 * suporta o DDL nem as sessões longas do `prisma migrate`. Em runtime é o
 * contrário — a aplicação usa o pooler (ver src/lib/prisma.ts).
 *
 * O schema vai na URL porque é assim que o CLI do Prisma o recebe; o runtime
 * lê a mesma variável e a passa ao adapter. Uma fonte de verdade só.
 */
function migrationUrl() {
  const base = env("DIRECT_URL") ?? env("DATABASE_URL");
  if (!base) return undefined;

  let url: URL;
  try {
    url = new URL(base);
  } catch {
    throw new Error(
      `DIRECT_URL não é uma URL válida: "${base.slice(0, 18)}…".\n` +
        `  Comece com postgresql:// e SEM aspas — no .env elas existem, mas\n` +
        `  painéis como o da Vercel guardam o que você colar, aspas incluídas.`,
    );
  }

  url.searchParams.set("schema", identificador("DB_SCHEMA", env("DB_SCHEMA", "crm")!));
  return url.toString();
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: migrationUrl(),
  },
});
