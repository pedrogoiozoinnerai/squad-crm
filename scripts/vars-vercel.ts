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
  // Monta a URL de retorno do OAuth; sem ela o Google recusa o login.
  NEXT_PUBLIC_APP_URL: env("NEXT_PUBLIC_APP_URL", "https://squad-crm.vercel.app"),
  GOOGLE_CLIENT_ID: env("GOOGLE_CLIENT_ID"),
  GOOGLE_CLIENT_SECRET: env("GOOGLE_CLIENT_SECRET"),
};

/**
 * `--bloco` imprime no formato CHAVE=valor, para colar de uma vez só.
 *
 * O painel da Vercel aceita um .env inteiro colado no campo da chave e o
 * quebra em várias variáveis. Colar o `.env` do projeto direto seria um erro:
 * ele aponta para `crm_dev` e `type_dev`. Este bloco é o mesmo conteúdo já
 * corrigido para produção, que é a única diferença que importa — e a que todo
 * mundo esquece.
 */
const BLOCO = process.argv.includes("--bloco");

let problemas = 0;
if (!BLOCO) {
  console.log("\nVercel → Settings → Environment Variables → Production");
  console.log("Um campo por variável. Cole só o que vem depois do nome.");
  console.log("Para colar tudo de uma vez:  npm run vercel:vars -- --bloco\n");
}

for (const [nome, valor] of Object.entries(PRODUCAO)) {
  if (!valor) {
    if (BLOCO) continue;
    const opcional = nome.startsWith("GOOGLE_");
    console.log(`  ${nome}\n    ${opcional ? "— vazio (entrada com Google fica desligada)" : "✗ ausente no .env local"}\n`);
    if (!opcional) problemas++;
    continue;
  }
  // Só as de conexão. `NEXT_PUBLIC_APP_URL` também termina em _URL e é um
  // endereço de site — cobrá-la de começar com postgresql:// seria absurdo.
  const CONEXAO = ["DATABASE_URL", "DIRECT_URL", "TYPE_DATABASE_URL"];
  const defeito = CONEXAO.includes(nome) ? diagnosticarUrlPostgres(valor) : null;
  if (defeito) {
    console.log(`  ${nome}\n    ✗ o próprio .env está errado: ${defeito}\n`);
    problemas++;
    continue;
  }
  if (BLOCO) {
    console.log(`${nome}=${valor}`);
  } else {
    console.log(`  ${nome}`);
    console.log(`  ${valor}\n`);
  }
}

if (BLOCO) process.exit(problemas === 0 ? 0 : 1);

console.log(
  problemas === 0
    ? "Depois de salvar, redeploy e confira:\n  curl https://squad-crm.vercel.app/api/saude\n"
    : `\n⚠ ${problemas} variável(is) com problema aqui mesmo — corrija o .env antes.\n`,
);
