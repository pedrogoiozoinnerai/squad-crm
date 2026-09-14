"use client";

import { useActionState } from "react";
import { AlertCircle, CheckCircle2, Download, Loader2 } from "lucide-react";

import { importFunnelLeads, type ImportState } from "@/app/actions/import";

export function ImportPanel({ configured }: { configured: boolean }) {
  const [state, run, pending] = useActionState<ImportState, FormData>(
    () => importFunnelLeads(),
    null,
  );

  return (
    <div className="card max-w-2xl p-6">
      <p className="text-sm text-muted">
        O CRM lê os leads que chegaram ao fim do funil e cria cada um aqui com os
        dados de contato, o setor e as UTMs preservadas. Quem já agendou pelo
        funil entra também no calendário.
      </p>

      <ul className="mt-4 flex flex-col gap-1.5 text-sm text-muted">
        <li>
          A operação é <strong className="text-foreground">idempotente</strong> —
          rodar de novo não duplica lead nenhum.
        </li>
        <li>
          Os leads chegam <strong className="text-foreground">sem responsável</strong>,
          para você distribuir entre os vendedores.
        </li>
        <li>
          Cada lead abre um <strong className="text-foreground">negócio na primeira
          etapa</strong>, sem valor — senão ele fica invisível na receita do Dashboard.
        </li>
      </ul>

      {!configured && (
        <p className="mt-5 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          Configure <code className="font-mono">TYPE_DB_SCHEMA</code> no{" "}
          <code className="font-mono">.env</code> (o schema do funil dentro do
          banco compartilhado) antes de importar.
        </p>
      )}

      {state?.error && (
        <p
          role="alert"
          className="mt-5 flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-700"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          {state.error}
        </p>
      )}

      {state?.ok && (
        <p className="mt-5 flex items-start gap-2 rounded-xl bg-waz-95 px-3 py-2.5 text-sm text-waz-20">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          {state.created} lead(s) importado(s), {state.deals} negócio(s)
          aberto(s), {state.meetings} reunião(ões) agendada(s) e {state.skipped}{" "}
          já existia(m).
        </p>
      )}

      <form action={run} className="mt-6">
        <button type="submit" disabled={pending || !configured} className="btn-primary">
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
          Importar leads do funil
        </button>
      </form>
    </div>
  );
}
