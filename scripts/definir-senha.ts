import "dotenv/config";

import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { Client } from "pg";
import bcrypt from "bcryptjs";

/**
 * Define a senha de uma conta, direto no banco.
 *
 * Existe porque o CRM não tem "esqueci minha senha" — não tem serviço de
 * e-mail, e inventar um só para o ambiente de desenvolvimento seria mais
 * infraestrutura do que o problema pede. Quem perdeu a senha do `crm_dev`
 * ficava sem caminho nenhum: a conta existe, está ativa, e a única porta é uma
 * senha que ninguém lembra.
 *
 * A senha é digitada AQUI, no seu terminal, e não passa por lugar nenhum além
 * do bcrypt. Ela nunca aparece no histórico do shell (não é argumento), nem na
 * tela (o eco é desligado), nem em log alg um.
 *
 *   npm run senha                      → conta no crm_dev
 *   npm run senha -- --producao        → conta no crm, com confirmação
 */

const CUSTO = 10; // o mesmo de `hashPassword` em src/lib/auth.ts

/**
 * Perguntar, com ou sem terminal.
 *
 * Duas implementações porque são dois mundos. Num terminal de verdade a
 * pergunta é interativa e o eco da senha é desligado. Vindo de um pipe — que é
 * como o teste roda — o `readline` lê o bloco inteiro de uma vez e fecha no
 * fim do `stdin`: a segunda pergunta então falha com "readline was closed".
 * Por isso, sem terminal, lemos tudo antes e servimos linha a linha.
 */
let interativo: ReturnType<typeof createInterface> | null = null;
let linhas: string[] | null = null;

async function lerTudo(): Promise<string[]> {
  const pedacos: Buffer[] = [];
  for await (const p of stdin) pedacos.push(Buffer.from(p));
  return Buffer.concat(pedacos).toString("utf8").split("\n");
}

async function perguntar(pergunta: string, segredo = false): Promise<string> {
  if (!stdin.isTTY) {
    linhas ??= await lerTudo();
    stdout.write(pergunta + (segredo ? "\n" : "\n"));
    return (linhas.shift() ?? "").trim();
  }

  interativo ??= createInterface({ input: stdin, output: stdout });

  if (!segredo) return (await interativo.question(pergunta)).trim();

  stdout.write(pergunta);
  const visivel = (interativo as unknown as { _writeToOutput: unknown })._writeToOutput;
  (interativo as unknown as { _writeToOutput: (c: string) => void })._writeToOutput = (chunk) => {
    // Deixa passar Enter e as interrupções; engole os caracteres da senha.
    if ("\r\n\u0004\u0003".includes(String(chunk))) stdout.write(String(chunk));
  };
  try {
    const resposta = await interativo.question("");
    stdout.write("\n");
    return resposta.trim();
  } finally {
    (interativo as unknown as { _writeToOutput: unknown })._writeToOutput = visivel;
  }
}

async function main() {
  const schema = process.env.DB_SCHEMA ?? "";
  const producao = process.argv.includes("--producao");

  if (!schema) throw new Error("DB_SCHEMA não definida.");
  if (!schema.endsWith("_dev") && !producao) {
    throw new Error(`"${schema}" não é um schema de desenvolvimento. Use --producao se é isso mesmo.`);
  }

  console.log(`\nDefinir senha · schema ${schema}${producao ? "  ⚠ PRODUÇÃO" : ""}\n`);

  const email = (await perguntar("E-mail da conta: ")).toLowerCase();
  if (!email) throw new Error("Sem e-mail, não há o que fazer.");

  const c = new Client({ connectionString: process.env.DIRECT_URL });
  await c.connect();

  try {
    const u = await c.query<{ id: string; name: string; active: boolean }>(
      `SELECT id, name, active FROM "${schema}"."User" WHERE email = $1`,
      [email],
    );
    if (!u.rowCount) throw new Error(`Nenhuma conta com ${email} em ${schema}.`);
    const { id, name, active } = u.rows[0];
    console.log(`Conta: ${name}${active ? "" : "  ⚠ INATIVA — reative em Usuários"}\n`);

    const senha = await perguntar("Nova senha (mínimo 8):  ", true);
    if (senha.length < 8) throw new Error("A senha precisa ter ao menos 8 caracteres.");

    const repetida = await perguntar("Repita:                 ", true);
    if (senha !== repetida) throw new Error("As duas não são iguais. Nada foi alterado.");

    await c.query(
      `UPDATE "${schema}"."User" SET "passwordHash" = $1, "claimedAt" = COALESCE("claimedAt", now()) WHERE id = $2`,
      [await bcrypt.hash(senha, CUSTO), id],
    );

    // As sessões antigas caem: trocar a senha e deixar o navegador de ontem
    // logado é metade de uma troca de senha.
    const fora = await c.query(`DELETE FROM "${schema}"."AuthSession" WHERE "userId" = $1`, [id]);

    // E a trava de força bruta some: quem acabou de provar que é dono da conta
    // não pode ficar preso pelas próprias tentativas erradas.
    await c.query(`DELETE FROM "${schema}"."LoginAttempt" WHERE email = $1`, [email]);

    console.log(`\n✓ senha trocada. ${fora.rowCount} ${fora.rowCount === 1 ? "sessão encerrada" : "sessões encerradas"}, tentativas zeradas.`);
    console.log(`  Entre em ${schema.endsWith("_dev") ? "http://localhost:3000" : process.env.NEXT_PUBLIC_APP_URL ?? "produção"}\n`);
  } finally {
    await c.end();
    interativo?.close();
  }
}

main().catch((erro) => {
  console.error("\n✗", erro instanceof Error ? erro.message : erro, "\n");
  process.exit(1);
});
