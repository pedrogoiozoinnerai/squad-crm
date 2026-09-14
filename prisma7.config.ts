import "dotenv/config";
import { defineConfig } from "prisma/config";

/**
 * A migração roda na conexão DIRETA (5432): o pooler em modo transaction não
 * suporta o DDL nem as sessões longas do `prisma migrate`. Em runtime é o
 * contrário — a aplicação usa o pooler (ver src/lib/prisma.ts).
 *
 * O schema vai na URL porque é assim que o CLI do Prisma o recebe; o runtime
 * lê a mesma variável e a passa ao adapter. Uma fonte de verdade só.
 */
function migrationUrl() {
  const base = process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"];
  if (!base) return undefined;

  const schema = process.env["DB_SCHEMA"] ?? "crm";
  const url = new URL(base);
  url.searchParams.set("schema", schema);
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
