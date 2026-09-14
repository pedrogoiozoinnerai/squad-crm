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
/**
 * Este arquivo é lido em TODO comando do Prisma — inclusive no `generate` do
 * build, que não toca no banco. Por isso ele nunca lança: um valor estranho no
 * ambiente derrubaria o deploy inteiro por causa de um comando que sequer
 * precisa de conexão. Quando não dá para montar a URL, avisa e devolve
 * undefined; quem realmente precisa dela é o `migrate`, e aí o Prisma reclama.
 */
function migrationUrl() {
  const base = env("DIRECT_URL") ?? env("DATABASE_URL");
  if (!base) return undefined;

  let url: URL;
  try {
    url = new URL(base);
  } catch {
    console.warn(
      `\n⚠ DIRECT_URL não é uma URL válida: "${base.slice(0, 24)}…"\n` +
        `  Deve começar com postgresql:// e vir SEM aspas e SEM o nome da\n` +
        `  variável. No .env as aspas existem e o dotenv as remove; painéis\n` +
        `  como o da Vercel guardam exatamente o que você colar.\n` +
        `  Isso só impede migrações — o build segue.\n`,
    );
    return undefined;
  }

  try {
    url.searchParams.set("schema", identificador("DB_SCHEMA", env("DB_SCHEMA", "crm")!));
  } catch (e) {
    console.warn(`\n⚠ ${(e as Error).message}\n  Isso só impede migrações — o build segue.\n`);
    return undefined;
  }
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
