import "dotenv/config";

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
 * Num terminal, TUDO passa pelo mesmo leitor em modo cru — inclusive a
 * pergunta do e-mail, que não é segredo nenhum. Não é preciosismo: enquanto o
 * `readline` existe ele fica escutando o `stdin` e ecoando cada tecla, e o
 * `close()` dele restaura o modo do terminal num tick posterior, desfazendo o
 * `setRawMode` de quem vier depois. Foi assim que a PRIMEIRA senha apareceu na
 * tela e a segunda não. Com um leitor só, não há ninguém para disputar o TTY.
 *
 * Fora de um terminal (entrada por pipe, que é como o teste automatizado roda)
 * não há modo cru: lê tudo de uma vez e serve linha a linha.
 */
let linhas: string[] | null = null;

async function lerTudo(): Promise<string[]> {
  const pedacos: Buffer[] = [];
  for await (const p of stdin) pedacos.push(Buffer.from(p));
  return Buffer.concat(pedacos).toString("utf8").split("\n");
}

/**
 * Lê uma linha do TTY em modo cru.
 *
 * `segredo` troca o eco por asteriscos. Asterisco e não silêncio total: sem
 * nenhum retorno a pessoa acha que o teclado morreu e digita a senha de novo.
 */
function lerDoTerminal(pergunta: string, segredo: boolean): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    stdout.write(pergunta);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    let buffer = "";
    const redesenhar = () => {
      const visivel = segredo ? "*".repeat(buffer.length) : buffer;
      // `\u001b[2K` limpa a linha: sem isso, apagar deixa restos do que já
      // tinha sido desenhado.
      stdout.write("\r\u001b[2K" + pergunta + visivel);
    };

    const terminar = (erro?: Error) => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener("data", aoDigitar);
      stdout.write("\n");
      if (erro) reject(erro);
      else resolve(buffer);
    };

    const aoDigitar = (tecla: string) => {
      for (const ch of tecla) {
        if (ch === "\r" || ch === "\n" || ch === "\u0004") {
          // Redesenha antes de sair: colado de uma vez, o texto chega no mesmo
          // pedaço que o Enter, e sem isto a linha ficaria em branco.
          redesenhar();
          return terminar();
        }
        // Ctrl+C precisa continuar saindo: em modo cru o sinal não chega
        // sozinho, e ficar preso num prompt sem saída é pior que o eco.
        if (ch === "\u0003") return terminar(new Error("Cancelado."));
        if (ch === "\u007f" || ch === "\b") buffer = buffer.slice(0, -1);
        else if (ch >= " ") buffer += ch;
      }
      redesenhar();
    };

    stdin.on("data", aoDigitar);
  });
}

async function perguntar(pergunta: string, segredo = false): Promise<string> {
  if (!stdin.isTTY) {
    linhas ??= await lerTudo();
    stdout.write(pergunta + "\n");
    return (linhas.shift() ?? "").trim();
  }
  return (await lerDoTerminal(pergunta, segredo)).trim();
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
  }
}

main().catch((erro) => {
  console.error("\n✗", erro instanceof Error ? erro.message : erro, "\n");
  process.exit(1);
});
