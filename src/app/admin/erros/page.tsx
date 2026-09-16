import { AlertTriangle } from "lucide-react";

import { PageHeader } from "@/components/shell/PageHeader";
import { requireUser } from "@/lib/auth";
import { getErrosRecentes } from "@/lib/queries";
import { TZ } from "@/lib/dates";

/**
 * Os erros que o servidor registrou.
 *
 * Existe porque "quebrou e ninguém soube" foi um problema real aqui: produção
 * ficou dias com um `digest` na tela e nenhuma pista do lado de dentro. O
 * código que o usuário vê na tela de erro é o mesmo desta lista — é o que
 * transforma "deu erro" num diagnóstico.
 */
export default async function ErrosPage() {
  await requireUser("admin");
  const { erros, ultimas24h } = await getErrosRecentes();

  return (
    <>
      <PageHeader
        title="Erros do servidor"
        subtitle={
          ultimas24h > 0
            ? `${ultimas24h} nas últimas 24 horas · os ${erros.length} mais recentes abaixo`
            : "Nada nas últimas 24 horas"
        }
      />

      {erros.length === 0 ? (
        <div className="card grid place-items-center py-16 text-center">
          <span className="grid size-14 place-items-center rounded-full bg-waz-95 text-waz-20">
            <AlertTriangle className="size-6" />
          </span>
          <p className="mt-4 text-base font-semibold">Nenhum erro registrado</p>
          <p className="mt-1 max-w-sm text-sm text-muted">
            Toda falha de servidor entra aqui sozinha, com o mesmo código que aparece na tela de
            quem encontrou o problema.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {erros.map((erro) => (
            <li key={erro.id} className="card p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-semibold">{erro.message}</p>
                <span className="font-mono text-xs text-muted">
                  {erro.createdAt.toLocaleString("pt-BR", { timeZone: TZ, dateStyle: "short", timeStyle: "short" })}
                </span>
              </div>

              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                {erro.path && (
                  <span className="font-mono">
                    {erro.method} {erro.path}
                  </span>
                )}
                {erro.origem && <span>{erro.origem}</span>}
                {erro.digest && <span className="font-mono">digest {erro.digest}</span>}
              </p>

              {erro.stack && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-muted hover:text-foreground">
                    Ver a pilha
                  </summary>
                  <pre className="mt-2 overflow-x-auto rounded-lg bg-surface-2 p-3 text-[11px] leading-relaxed">
                    {erro.stack}
                  </pre>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
