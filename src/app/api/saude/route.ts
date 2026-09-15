import { DB_SCHEMA, prisma, urlReparada } from "@/lib/prisma";

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
  const url = m.match(/DATABASE_URL inválida: ([^.]+)\./);
  if (url) return `DATABASE_URL: ${url[1]}`;
  if (/inválido/i.test(m)) return "DB_SCHEMA inválido";
  if (/does not exist|não existe/i.test(m)) return `schema "${DB_SCHEMA}" ou suas tabelas não existem — falta migrar`;
  if (/ECONNREFUSED|ETIMEDOUT|Can't reach/i.test(m)) return "banco inalcançável a partir desta região";
  if (/password|authentication/i.test(m)) return "credenciais recusadas pelo banco";
  return "falha ao consultar";
}

export async function GET() {
  try {
    // `assumidas` é o número que decide o primeiro ADMIN, não o total: as 34
    // contas importadas do HubSpot existem sem ninguém atrás delas, e contá-las
    // fazia este endpoint dizer que o cadastro inicial já tinha acontecido.
    const [etapas, usuarios, assumidas] = await Promise.all([
      prisma.stage.count(),
      prisma.user.count(),
      prisma.user.count({ where: { claimedAt: { not: null } } }),
    ]);
    return Response.json({
      banco: "ok",
      schema: DB_SCHEMA,
      etapas,
      usuarios,
      assumidas,
      // Sem usuário nenhum, o primeiro cadastro vira ADMIN — vale avisar.
      pronto: etapas > 0,
      ...(urlReparada
        ? { aviso: "DATABASE_URL tinha espaço ou quebra de linha; foi emendada. Corrija no painel." }
        : {}),
      primeiroCadastroViraAdmin: assumidas === 0,
    });
  } catch (erro) {
    console.error("[saude] falha ao consultar o banco:", erro);
    return Response.json({ banco: "falha", schema: DB_SCHEMA, causa: categoria(erro) }, { status: 503 });
  }
}
