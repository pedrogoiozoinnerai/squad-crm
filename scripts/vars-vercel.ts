import "dotenv/config";

import { diagnosticarUrlPostgres, env } from "../src/lib/env";

/**
 * Imprime as variáveis de produção, uma por linha, prontas para colar.
 *
 * Existe porque o erro mais caro deste deploy não foi de código: foi copiar do
 * `.env` para o painel da Vercel. O arquivo tem comentários, aspas e quebras de
 * linha; o campo do painel guarda tudo isso e só reclama em runtime. Aqui sai o
 * valor limpo, com os schemas já trocados para produção.
 *
 * Roda na SUA máquina e imprime segredos na SUA tela. Não jogue a saída em
 * lugar nenhum que fique salvo.
 */
const PRODUCAO: Record<string, string | undefined> = {
  DATABASE_URL: env("DATABASE_URL"),
  DIRECT_URL: env("DIRECT_URL"),
  DB_SCHEMA: "crm", // ← o .env local diz crm_dev
  TYPE_DATABASE_URL: env("TYPE_DATABASE_URL") ?? env("DATABASE_URL"),
  TYPE_DB_SCHEMA: "type", // ← o .env local diz type_dev
  ALLOWED_EMAIL_DOMAIN: env("ALLOWED_EMAIL_DOMAIN", "innerai.com"),
  // Sem esta, em produção o cadastro fica fechado — de propósito: quem chegasse
  // primeiro viraria administrador de uma base com a operação inteira dentro.
  ADMIN_EMAIL: env("ADMIN_EMAIL", "pedro.goiozo@innerai.com"),
  NEXT_PUBLIC_BRAND_NAME: env("NEXT_PUBLIC_BRAND_NAME", "Squad.com"),
};

let problemas = 0;
console.log("\nVercel → Settings → Environment Variables → Production");
console.log("Um campo por variável. Cole só o que vem depois do nome.\n");

for (const [nome, valor] of Object.entries(PRODUCAO)) {
  if (!valor) {
    console.log(`  ${nome}\n    ✗ ausente no .env local\n`);
    problemas++;
    continue;
  }
  const defeito = nome.endsWith("_URL") ? diagnosticarUrlPostgres(valor) : null;
  if (defeito) {
    console.log(`  ${nome}\n    ✗ o próprio .env está errado: ${defeito}\n`);
    problemas++;
    continue;
  }
  console.log(`  ${nome}`);
  console.log(`  ${valor}\n`);
}

console.log(
  problemas === 0
    ? "Depois de salvar, redeploy e confira:\n  curl https://squad-crm.vercel.app/api/saude\n"
    : `\n⚠ ${problemas} variável(is) com problema aqui mesmo — corrija o .env antes.\n`,
);
