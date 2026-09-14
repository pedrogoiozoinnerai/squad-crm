import { DB_SCHEMA, prisma } from "@/lib/prisma";

/**
 * Diz se o app enxerga o banco. Pública de propósito: existe para conferir um
 * deploy antes de ter usuário, que é justamente quando não dá para entrar.
 *
 * Nenhuma configuração sai daqui — só o nome do schema, que já está no README,
 * e uma categoria de erro. Mensagem crua do Prisma traz host e usuário da
 * conexão, então ela fica no log do servidor, não na resposta.
 */
export const dynamic = "force-dynamic";

function categoria(erro: unknown): string {
  const m = String(erro);
  if (/não configurada|not configured/i.test(m)) return "variável de ambiente ausente";
  if (/não parece uma URL|Invalid URL/i.test(m)) return "DATABASE_URL malformada — confira aspas e o nome da variável colado junto";
  if (/inválido/i.test(m)) return "DB_SCHEMA inválido";
  if (/does not exist|não existe/i.test(m)) return `schema "${DB_SCHEMA}" ou suas tabelas não existem — falta migrar`;
  if (/ECONNREFUSED|ETIMEDOUT|Can't reach/i.test(m)) return "banco inalcançável a partir desta região";
  if (/password|authentication/i.test(m)) return "credenciais recusadas pelo banco";
  return "falha ao consultar";
}

export async function GET() {
  try {
    const [etapas, usuarios] = await Promise.all([prisma.stage.count(), prisma.user.count()]);
    return Response.json({
      banco: "ok",
      schema: DB_SCHEMA,
      etapas,
      usuarios,
      // Sem usuário nenhum, o primeiro cadastro vira ADMIN — vale avisar.
      pronto: etapas > 0,
      primeiroCadastroViraAdmin: usuarios === 0,
    });
  } catch (erro) {
    console.error("[saude] falha ao consultar o banco:", erro);
    return Response.json({ banco: "falha", schema: DB_SCHEMA, causa: categoria(erro) }, { status: 503 });
  }
}
