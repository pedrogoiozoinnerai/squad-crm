import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Migração usa a conexão DIRETA (5432): o pooler em modo transaction não
    // suporta o DDL e as sessões longas do `prisma migrate`. Em runtime é o
    // contrário — a aplicação usa o pooler (ver src/lib/prisma.ts).
    url: process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"],
  },
});
