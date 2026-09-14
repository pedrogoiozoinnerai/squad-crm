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

/**
 * Limpa o valor vindo do ambiente antes de tratá-lo como URL.
 *
 * No `.env` os valores ficam entre aspas e o dotenv as remove ao ler. Painéis
 * como o da Vercel **não** removem: quem copia `"postgres://…"` do arquivo
 * acaba gravando as aspas junto, e `new URL()` morre com um "Invalid URL" que
 * não diz onde está o problema. Aqui a gente tolera e, quando não dá, explica.
 */
function limpar(valor: string | undefined) {
  return valor?.trim().replace(/^['"]|['"]$/g, "") || undefined;
}

function migrationUrl() {
  const base = limpar(process.env["DIRECT_URL"]) ?? limpar(process.env["DATABASE_URL"]);
  if (!base) return undefined;

  const schema = limpar(process.env["DB_SCHEMA"]) ?? "crm";

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
